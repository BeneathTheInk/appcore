import _ from "underscore";
import objectPath from "object-path";
import merge from "plain-merge";

export default function options() {
	// fresh options, but could be set prior
	if (this.options == null) this.options = {};

	// attach base methods
	this.get = get;
	this.getBrowserOptions = getBrowserOptions;
	this.unset = unset;
	this.setBrowserOption = setBrowserOption;

	// create setter methods
	_.each({
		reset: [ true ],
		set: [ false, false ],
		defaults: [ false, true ]
	}, function(args, method) {
		this[method] = function(key, val) {
			if (typeof key === "object") {
				val = key;
				key = null;
			}

			val = set.apply(null, [ this.options, key, val ].concat(args));
			if (key == null) this.options = val;

			return this;
		};
	}, this);
}

export var defaults = {
	cwd: process.browser ? "/" : process.cwd(),
	env: process.env.NODE_ENV || "development",
	browserKeys: [ "env" ]
};

export function get(key) {
	// clone the local value so we aren't writing on it
	var val = merge.extend({}, objectPath.get(this.options, key));

	// merge the super default value
	return merge.defaults(val, objectPath.get(defaults, key));
}

export function getBrowserOptions() {
	var options = {};
	var keys = this.get("browserKeys");
	if (!_.isArray(keys)) keys = keys != null ? [ keys ] : [];
	keys.forEach(function(k) { objectPath.set(options, k, this.get(k)); }, this);
	merge.extend(options, this.get("browserOptions"));
	return options;
}

export function set(data, key, val, reset, safe) {
	var root = key == null;

	// prevent total annihilation of options object
	if (root && val == null) val = {};

	var cval = root ? data : objectPath.get(data, key);
	var nval = reset ? val : merge(cval, val, safe);

	if (cval !== nval) {
		if (root) data = nval;
		else objectPath.set(data, key, nval);
	}

	return data;
}

export function unset(key) {
	var val = set(this.options, key, void 0, true);
	if (key == null) this.options = val;
	return this;
}

export function setBrowserOption(key, val) {
	if (typeof key === "object") {
		val = key;
		key = null;
	}

	var data = this.get("browserOptions");
	data = set(data, key, val, false, false);
	return this.set("browserOptions", data);
}
