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

var Appcore = require("../");
var resolve = require("resolve");
var app, plugins;

try {
	plugins = argv._;
	if (!plugins.length) plugins.push("./");

	plugins = plugins.map(function(n) {
		return resolve.sync(n, { basedir: process.cwd() });
	}).map(function(n) {
		return require(n);
	});

	if (plugins.length === 1 && Appcore.isApp(plugins[0])) {
		app = plugins[0];
	} else {
		app = Appcore("app");
		plugins.forEach(function(p) { app.use(p); });
	}

	app.start.apply(app, [].concat(argv.config, argv));
} catch(e) {
	console.log(e.toString());
}
