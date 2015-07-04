#!/usr/bin/env node

var argv = require("minimist")(process.argv.slice(2), {
	string: [ "config" ],
	boolean: [ "help" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		c: "config"
	}
});

if (argv.help || argv._[0] === "help") {
	console.log("Usage: appcore [OPTIONS]");
	process.exit(0);
}

if (argv.version === true) {
	var pkg = require("../package.json");
	console.log("%s v%s", pkg.name, pkg.version);
	process.exit(0);
}

var _ = require("underscore");
var Appcore = require("../");
var resolve = require("resolve");
var fs = require("fs");
var path = require("path");
var app, plugins;

try {
	plugins = argv._;
	if (!plugins.length) plugins.push("./");

	var fpath, cwd = process.cwd();

	plugins = plugins.map(function(file) {
		var fpath;

		// look up as a local file path
		if (!/^\.{0,2}(?:$|\/)/.test(file) &&
			fs.existsSync(path.join(cwd, file))) fpath = path.join(cwd, file);

		// or attempt to resolve like require does
		else { try {
			fpath = resolve.sync(file, { basedir: cwd });
		} catch(e) {} }

		if (fpath == null) throw new Error("Could not locate '" + file + "'");

		return fpath;
	}).map(function(n) {
		return require(n);
	});

	if (plugins.length === 1) plugins = plugins[0];

	if (Appcore.isClass(plugins)) app = plugins();
	else if (Appcore.isApp(plugins)) app = plugins;
	else {
		app = Appcore();
		plugins = [].concat(plugins);
	}

	// apply each config file in order
	_.compact([].concat(argv.config)).forEach(function(config) {
		try {
			app.set(require(path.resolve(cwd, config)));
		} catch(e) {
			if (argv.verbose) app.log.warn(e.message || e.toString());
		}
	});

	// apply raw argv last
	app.set(argv);

	// add all the plugins
	if (_.isArray(plugins)) plugins.forEach(function(plugin) {
		app.use(plugin);
	});
} catch(e) {
	console.log(e.stack || e.toString());
}
