import { configuredStore } from 'store';
import { delay, SagaIterator } from 'redux-saga';
import { call, cancel, fork, put, take, select, apply } from 'redux-saga/effects';
import { cloneableGenerator, createMockTask } from 'redux-saga/utils';
import {
  toggleOffline,
  changeNode,
  changeNodeIntent,
  changeNodeForce,
  setLatestBlock
} from 'actions/config';
import {
  handleNodeChangeIntent,
  handlePollOfflineStatus,
  pollOfflineStatus,
  handleNewNetwork
} from 'sagas/config/node';
import {
  getNodeId,
  getNodeConfig,
  getOffline,
  isStaticNodeId,
  getStaticNodeFromId,
  getCustomNodeFromId,
  getStaticAltNodeIdToWeb3,
  getNetworkConfig
} from 'selectors/config';
import { Web3Wallet } from 'libs/wallet';
import { showNotification } from 'actions/notifications';
import { translateRaw } from 'translations';
import { StaticNodeConfig } from 'types/node';
import { staticNodesExpectedState } from './nodes/staticNodes.spec';
import { metaExpectedState } from './meta/meta.spec';
import { selectedNodeExpectedState } from './nodes/selectedNode.spec';
import { customNodesExpectedState, firstCustomNodeId } from './nodes/customNodes.spec';
import { unsetWeb3Node, unsetWeb3NodeOnWalletEvent } from 'sagas/config/web3';
import { shepherd } from 'mycrypto-shepherd';

// init module
configuredStore.getState();

describe('pollOfflineStatus*', () => {
  const { togglingToOffline, togglingToOnline } = metaExpectedState;
  const nav = navigator as any;
  const doc = document as any;
  const data = {} as any;
  data.gen = cloneableGenerator(pollOfflineStatus)();
  const node = {
    lib: {
      ping: jest.fn()
    }
  };
  const raceSuccess = {
    pingSucceeded: true,
    timeout: false
  };

  let originalHidden: any;
  let originalOnLine: any;
  let originalRandom: any;

  beforeAll(() => {
    // backup global config
    originalHidden = document.hidden;
    originalOnLine = navigator.onLine;
    originalRandom = Math.random;

    // mock config
    Object.defineProperty(document, 'hidden', { value: false, writable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    Math.random = () => 0.001;
  });

  afterAll(() => {
    // restore global config
    Object.defineProperty(document, 'hidden', {
      value: originalHidden,
      writable: false
    });
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: false
    });
    Math.random = originalRandom;
  });

  it('should select getOffline', () => {
    expect(data.gen.next(node).value).toEqual(select(getOffline));
  });

  it('should call delay if document is hidden', () => {
    data.hiddenDoc = data.gen.clone();
    doc.hidden = true;
    data.isOfflineClone = data.gen.clone();
    data.shouldDelayClone = data.gen.clone();
    expect(data.hiddenDoc.next(togglingToOnline.offline).value).toEqual(call(delay, 1000));

    doc.hidden = false;
  });

  it('should toggle offline and show notification if navigator disagrees with isOffline and ping succeeds', () => {
    data.gen.next(raceSuccess);

    expect(data.gen.next(raceSuccess).value).toEqual(
      put(showNotification('success', 'Your connection to the network has been restored!', 3000))
    );
    expect(data.gen.next().value).toEqual(put(toggleOffline()));
  });

  it('should toggle offline and show notification if navigator agrees with isOffline and ping fails', () => {
    nav.onLine = togglingToOffline.offline;

    data.isOfflineClone.next(false);
    data.isOfflineClone.next(false);
    expect(data.isOfflineClone.next().value).toEqual(put(toggleOffline()));
  });
});

describe('handlePollOfflineStatus*', () => {
  const gen = handlePollOfflineStatus();
  const mockTask = createMockTask();

  it('should fork pollOffineStatus', () => {
    const expectedForkYield = fork(pollOfflineStatus);
    expect(gen.next().value).toEqual(expectedForkYield);
  });

  it('should take CONFIG_STOP_POLL_OFFLINE_STATE', () => {
    expect(gen.next(mockTask).value).toEqual(take('CONFIG_STOP_POLL_OFFLINE_STATE'));
  });

  it('should cancel pollOfflineStatus', () => {
    expect(gen.next().value).toEqual(cancel(mockTask));
  });
});

describe('handleNodeChangeIntent*', () => {
  let originalRandom: any;

  // normal operation variables
  const defaultNodeId: any = selectedNodeExpectedState.initialState.nodeId;
  const defaultNodeConfig: any = (staticNodesExpectedState as any).initialState[defaultNodeId];
  const newNodeId = Object.keys(staticNodesExpectedState.initialState).reduce(
    (acc, cur) =>
      (staticNodesExpectedState as any).initialState[cur].network !== defaultNodeConfig.network
        ? cur
        : acc
  );
  const newNodeConfig: StaticNodeConfig = (staticNodesExpectedState as any).initialState[newNodeId];

  const changeNodeIntentAction = changeNodeIntent(newNodeId);
  const latestBlock = '0xa';

  const data = {} as any;
  data.gen = cloneableGenerator(handleNodeChangeIntent)(changeNodeIntentAction);

  function shouldBailOut(gen: SagaIterator, nextVal: any, errMsg: string) {
    expect(gen.next(nextVal).value).toEqual(select(getNodeId));
    expect(gen.next(defaultNodeId).value).toEqual(put(showNotification('danger', errMsg, 5000)));
    expect(gen.next().value).toEqual(
      put(changeNode({ networkId: defaultNodeConfig.network, nodeId: defaultNodeId }))
    );
    expect(gen.next().done).toEqual(true);
  }

  beforeAll(() => {
    originalRandom = Math.random;
    Math.random = () => 0.001;
  });

  afterAll(() => {
    Math.random = originalRandom;
  });

  it('should select is static node', () => {
    expect(data.gen.next().value).toEqual(select(isStaticNodeId, newNodeId));
  });

  it('should select nodeConfig', () => {
    expect(data.gen.next(defaultNodeId).value).toEqual(select(getNodeConfig));
  });

  it('should select getStaticNodeFromId', () => {
    expect(data.gen.next(defaultNodeConfig).value).toEqual(select(getStaticNodeFromId, newNodeId));
  });

  it('should get the next network', () => {
    expect(data.gen.next(newNodeConfig).value).toMatchSnapshot();
  });

  it('should show error and revert to previous node if check times out', () => {
    data.clone1 = data.gen.clone();
    data.clone1.next(true);
    expect(data.clone1.throw('err').value).toEqual(select(getNodeId));
    expect(data.clone1.next(defaultNodeId).value).toEqual(
      put(showNotification('danger', translateRaw('ERROR_32'), 5000))
    );
    expect(data.clone1.next().value).toEqual(
      put(changeNode({ networkId: defaultNodeConfig.network, nodeId: defaultNodeId }))
    );
    expect(data.clone1.next().done).toEqual(true);
  });

  it('should sucessfully switch to the manual node', () => {
    expect(data.gen.next(latestBlock).value).toEqual(
      apply(shepherd, shepherd.manual, [newNodeId, false])
    );
  });

  it('should get the current block', () => {
    data.gen.next();
  });

  it('should put setLatestBlock', () => {
    expect(data.gen.next(latestBlock).value).toEqual(put(setLatestBlock(latestBlock)));
  });

  it('should put changeNode', () => {
    expect(data.gen.next().value).toEqual(
      put(changeNode({ networkId: newNodeConfig.network, nodeId: newNodeId }))
    );
  });

  it('should fork handleNewNetwork', () => {
    expect(data.gen.next().value).toEqual(fork(handleNewNetwork));
  });

  it('should be done', () => {
    expect(data.gen.next().done).toEqual(true);
  });

  // custom node variables
  const customNodeConfigs = customNodesExpectedState.addFirstCustomNode;
  const customNodeAction = changeNodeIntent(firstCustomNodeId);
  data.customNode = handleNodeChangeIntent(customNodeAction);

  // test custom node
  it('should select getCustomNodeConfig and match race snapshot', () => {
    data.customNode.next();
    data.customNode.next(false);
    expect(data.customNode.next(defaultNodeConfig).value).toEqual(
      select(getCustomNodeFromId, firstCustomNodeId)
    );
    expect(data.customNode.next(customNodeConfigs.customNode1).value).toMatchSnapshot();
  });

  const customNodeIdNotFound = firstCustomNodeId + 'notFound';
  const customNodeNotFoundAction = changeNodeIntent(customNodeIdNotFound);
  data.customNodeNotFound = handleNodeChangeIntent(customNodeNotFoundAction);

  // test custom node not found
  it('should handle unknown / missing custom node', () => {
    data.customNodeNotFound.next();
    data.customNodeNotFound.next(false);
  });

  it('should blah', () => {
    expect(data.customNodeNotFound.next(defaultNodeConfig).value).toEqual(
      select(getCustomNodeFromId, customNodeIdNotFound)
    );
  });

  it('should blahah', () => {
    shouldBailOut(
      data.customNodeNotFound,
      null,
      `Attempted to switch to unknown node '${customNodeNotFoundAction.payload}'`
    );
  });
});

describe('unsetWeb3Node*', () => {
  const node = 'web3';
  const alternativeNodeId = 'eth_mycrypto';
  const gen = unsetWeb3Node();

  it('should select getNode', () => {
    expect(gen.next().value).toEqual(select(getNodeId));
  });

  it('should get the current network', () => {
    expect(gen.next(node).value).toEqual(select(getNetworkConfig));
  });

  it('should switch networks', () => {
    expect(gen.next({ name: '' }).value).toEqual(apply(shepherd, shepherd.switchNetworks, ['']));
  });

  it('should select an alternative node to web3', () => {
    // get a 'no visual difference' error here
    expect(gen.next().value).toEqual(select(getStaticAltNodeIdToWeb3));
  });

  it('should put changeNodeForce', () => {
    expect(gen.next(alternativeNodeId).value).toEqual(put(changeNodeForce(alternativeNodeId)));
  });

  it('should be done', () => {
    expect(gen.next().done).toEqual(true);
  });

  it('should return early if node type is not web3', () => {
    const gen1 = unsetWeb3Node();
    gen1.next();
    gen1.next('notWeb3');
    expect(gen1.next().done).toEqual(true);
  });
});

describe('unsetWeb3NodeOnWalletEvent*', () => {
  const fakeAction: any = {};
  const mockNodeId = 'web3';
  const alternativeNodeId = 'eth_mycrypto';
  const gen = unsetWeb3NodeOnWalletEvent(fakeAction);

  it('should select getNode', () => {
    expect(gen.next().value).toEqual(select(getNodeId));
  });

  it('should get the current network', () => {
    expect(gen.next(mockNodeId).value).toEqual(select(getNetworkConfig));
  });

  it('should switch networks', () => {
    expect(gen.next({ name: '' }).value).toEqual(apply(shepherd, shepherd.switchNetworks, ['']));
  });

  it('should select an alternative node to web3', () => {
    expect(gen.next(mockNodeId).value).toEqual(select(getStaticAltNodeIdToWeb3));
  });

  it('should put changeNodeForce', () => {
    expect(gen.next(alternativeNodeId).value).toEqual(put(changeNodeForce(alternativeNodeId)));
  });

  it('should be done', () => {
    expect(gen.next().done).toEqual(true);
  });

  it('should return early if node type is not web3', () => {
    const gen1 = unsetWeb3NodeOnWalletEvent({ payload: false } as any);
    gen1.next(); //getNode
    gen1.next('notWeb3'); //getNodeConfig
    expect(gen1.next().done).toEqual(true);
  });

  it('should return early if wallet type is web3', () => {
    const mockAddress = '0x0';
    const mockNetwork = 'ETH';
    const mockWeb3Wallet = new Web3Wallet(mockAddress, mockNetwork);
    const gen2 = unsetWeb3NodeOnWalletEvent({ payload: mockWeb3Wallet } as any);
    gen2.next(); //getNode
    gen2.next('web3'); //getNodeConfig
    expect(gen2.next().done).toEqual(true);
  });
});
