import page from 'page';
import stableStringify from 'json-stable-stringify';
import { fromJS, is as isDeepEqual } from 'immutable';
import { omit, omitBy, isEmpty } from 'lodash';

import { hashDifferenceDeep } from './hash-utils';
import { storageSet } from './storage-utils';

import { getDefaultTopologyOptions, initialState as initialRootState } from '../reducers/root';

//
// page.js won't match the routes below if ":state" has a slash in it, so replace those before we
// load the state into the URL.
//
const SLASH = '/';
const SLASH_REPLACEMENT = '<SLASH>';
const PERCENT = '%';
const PERCENT_REPLACEMENT = '<PERCENT>';
export const STORAGE_STATE_KEY = 'scopeViewState';

export function encodeURL(url) {
  return url
    .replace(new RegExp(PERCENT, 'g'), PERCENT_REPLACEMENT)
    .replace(new RegExp(SLASH, 'g'), SLASH_REPLACEMENT);
}

export function decodeURL(url) {
  return decodeURIComponent(url.replace(new RegExp(SLASH_REPLACEMENT, 'g'), SLASH))
    .replace(new RegExp(PERCENT_REPLACEMENT, 'g'), PERCENT);
}

export function parseHashState(hash = window.location.hash) {
  const urlStateString = hash
    .replace('#!/state/', '')
    .replace('#!/', '') || '{}';
  return JSON.parse(decodeURL(urlStateString));
}

export function clearStoredViewState() {
  storageSet(STORAGE_STATE_KEY, '');
}

export function isStoreViewStateEnabled(state) {
  return state.get('storeViewState');
}

function shouldReplaceState(prevState, nextState) {
  // Opening a new terminal while an existing one is open.
  const terminalToTerminal = (prevState.controlPipe && nextState.controlPipe);
  // Closing a terminal.
  const closingTheTerminal = (prevState.controlPipe && !nextState.controlPipe);

  return terminalToTerminal || closingTheTerminal;
}

function omitDefaultValues(urlState) {
  // A couple of cases which require special handling because their URL state
  // default values might be in different format than their Redux defaults.
  if (!urlState.controlPipe) {
    urlState = omit(urlState, 'controlPipe');
  }
  if (isEmpty(urlState.nodeDetails)) {
    urlState = omit(urlState, 'nodeDetails');
  }
  if (isEmpty(urlState.topologyOptions)) {
    urlState = omit(urlState, 'topologyOptions');
  }

  // Omit all the fields which match their initial Redux state values.
  return omitBy(urlState, (value, key) => (
    isDeepEqual(fromJS(value), initialRootState.get(key))
  ));
}

export function getUrlState(state) {
  const cp = state.get('controlPipes').last();
  const nodeDetails = state.get('nodeDetails').toIndexedSeq().map(details => ({
    id: details.id, topologyId: details.topologyId
  }));
  // Compress the topologyOptions hash by removing all the default options, to make
  // the Scope state string smaller. The default options will always be used as a
  // fallback so they don't need to be explicitly mentioned in the state.
  const topologyOptionsDiff = hashDifferenceDeep(
    state.get('topologyOptions').toJS(),
    getDefaultTopologyOptions(state).toJS(),
  );

  const urlState = {
    contrastMode: state.get('contrastMode'),
    controlPipe: cp ? cp.toJS() : null,
    gridSortedBy: state.get('gridSortedBy'),
    gridSortedDesc: state.get('gridSortedDesc'),
    nodeDetails: nodeDetails.toJS(),
    pausedAt: state.get('pausedAt'),
    pinnedMetricType: state.get('pinnedMetricType'),
    pinnedSearches: state.get('pinnedSearches').toJS(),
    searchQuery: state.get('searchQuery'),
    selectedNodeId: state.get('selectedNodeId'),
    topologyId: state.get('currentTopologyId'),
    topologyOptions: topologyOptionsDiff,
    topologyViewMode: state.get('topologyViewMode'),
  };

  if (state.get('showingNetworks')) {
    urlState.showingNetworks = true;
    if (state.get('pinnedNetwork')) {
      urlState.pinnedNetwork = state.get('pinnedNetwork');
    }
  }

  // We can omit all the fields whose values correspond to their Redux initial
  // state, as that state will be used as fallback anyway when entering routes.
  return omitDefaultValues(urlState);
}

export function updateRoute(getState) {
  const state = getUrlState(getState());
  const prevState = parseHashState();
  const dispatch = false;

  const stateUrl = encodeURL(stableStringify(state));
  const prevStateUrl = encodeURL(stableStringify(prevState));
  if (stateUrl === prevStateUrl) return;

  // back up state in storage as well
  if (isStoreViewStateEnabled(getState())) {
    storageSet(STORAGE_STATE_KEY, stateUrl);
  }

  if (shouldReplaceState(prevState, state)) {
    // Replace the top of the history rather than pushing on a new item.
    page.replace(`/state/${stateUrl}`, state, dispatch);
  } else {
    page.show(`/state/${stateUrl}`, state, dispatch);
  }
}
