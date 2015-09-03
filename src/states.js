import _ from "underscore";

export const STATES = [ "startup", "ready", "running" ];
export const STATE_ERROR = "fail";
export const STATE_START = STATES[0];
export const STATE_END = STATES[STATES.length - 1];

export function isValidState(state) {
	return state === STATE_ERROR || _.contains(STATES, state);
}

export function checkState(state) {
	if (!isValidState(state)) {
		throw new Error("Invalid state '" + state + "'.");
	}
}

export function isErrorState(state) {
	checkState(state);
	return STATE_ERROR === state;
}

export function atState(actual, expected) {
	checkState(expected);

	// actual might be null
	if (actual == null) return false;
	checkState(actual);

	// if they are they same, we are at state
	// this also catches the fail state
	if (actual === expected) return true;

	// grab indexes
	let eindex = STATES.indexOf(expected);
	let aindex = STATES.indexOf(actual);

	// both must be in the states list
	if (eindex < 0 || aindex < 0) return false;

	// actual index should be greater than or equal to expected
	return aindex >= eindex;
}

export function nextState(state) {
	if (isErrorState(state) || atState(state, STATE_END)) return null;
	return STATES[STATES.indexOf(state) + 1];
}
