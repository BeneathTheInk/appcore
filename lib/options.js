var _ = require("underscore");
var objectPath = require("object-path");
var merge = require("plain-merge");

var defaults = {
	cwd: process.browser ? "/" : process.cwd(),
	env: process.env.NODE_ENV || "development",
	browserKeys: [ "log", "env" ]
};

module.exports = function() {
	// fresh options, but could be set prior
	if (this.options == null) this.options = {};

	// attach the getter methods
	this.get = get;
	this.getBrowserOptions = getBrowserOptions;

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

			return set.apply(this, [ key, val ].concat(args));
		}
	}, this);

	// unset just sets to undefined
	this.unset = function(key) {
		return set.apply(this, key, void 0, true);
	}
}

function set(key, val, reset, safe) {
	var root = key == null;

	// prevent total annihilation of options object
	if (root && val == null) val = {};

	var cval = root ? this.options : objectPath.get(this.options, key);
	var nval = reset ? val : merge(cval, val, safe);

	if (cval !== nval) {
		if (root) this.options = nval;
		else objectPath.set(this.options, key, nval);
	}

	return this;
}

function get(key) {
	// clone the local value so we aren't writing on it
	var val = merge({}, objectPath.get(this.options, key));
	var app = this.parent;

	// merge parent values in from the up the tree
	while (app != null) {
		val = merge(val, objectPath.get(app.options, key), true);
		app = app.parent;
	}

	// merge the super default value
	val = merge(val, objectPath.get(defaults, key), true);

	return val;
}

function getBrowserOptions() {
	var options = {};
	var keys = this.get("browserKeys");
	if (!_.isArray(keys)) keys = keys != null ? [ keys ] : [];
	keys.forEach(function(k) { objectPath.set(options, k, this.get(k)); }, this);
	merge.extend(options, this.get("browserOptions"));
	return options;
}
