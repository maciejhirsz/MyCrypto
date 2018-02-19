import {
  FetchTransactionDataAction,
  SetTransactionDataAction,
  SetRecentTransactionsAction,
  TransactionsAction,
  TypeKeys
} from 'actions/transactions';
import { TransactionData, TransactionReceipt } from 'libs/nodes';
import { SavedTransaction } from 'utils/localStorage';

export interface TransactionState {
  data: TransactionData | null;
  receipt: TransactionReceipt | null;
  error: string | null;
  isLoading: boolean;
}

export interface State {
  txData: { [txhash: string]: TransactionState };
  recent: SavedTransaction[];
}

export const INITIAL_STATE: State = {
  txData: {},
  recent: []
};

function fetchTxData(state: State, action: FetchTransactionDataAction): State {
  return {
    ...state,
    txData: {
      ...state.txData,
      [action.payload]: {
        data: null,
        receipt: null,
        error: null,
        isLoading: true
      }
    }
  };
}

function setTxData(state: State, action: SetTransactionDataAction): State {
  return {
    ...state,
    txData: {
      ...state.txData,
      [action.payload.txhash]: {
        data: action.payload.data,
        receipt: action.payload.receipt,
        error: action.payload.error,
        isLoading: false
      }
    }
  };
}

function resetTxData(state: State): State {
  return {
    ...state,
    txData: INITIAL_STATE.txData
  };
}

function setRecentTxs(state: State, action: SetRecentTransactionsAction): State {
  return {
    ...state,
    recent: action.payload
  };
}

export function transactions(state: State = INITIAL_STATE, action: TransactionsAction): State {
  switch (action.type) {
    case TypeKeys.TRANSACTIONS_FETCH_TRANSACTION_DATA:
      return fetchTxData(state, action);
    case TypeKeys.TRANSACTIONS_SET_TRANSACTION_DATA:
      return setTxData(state, action);
    case TypeKeys.TRANSACTIONS_RESET_TRANSACTION_DATA:
      return resetTxData(state);
    case TypeKeys.TRANSACTIONS_SET_RECENT_TRANSACTIONS:
      return setRecentTxs(state, action);
    default:
      return state;
  }
}