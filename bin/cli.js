#!/usr/bin/env node

var argv = require("minimist")(process.argv.slice(2), {
	string: [ "config" ],
	boolean: [ "help", "version" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		c: "config"
	},
	default: {
		config: "config.json"
	}
});

if (argv.help || argv._[0] === "help") {
	console.log("Usage: appcore [OPTIONS]");
	process.exit(0);
}

if (argv.version) {
	var pkg = require("../package.json");
	console.log("%s v%s", pkg.name, pkg.version);
	process.exit(0);
}

try {
	var Appcore = require("../");
	var app = require(process.cwd());

	if (!Appcore.isApp(app)) {
		throw new Error("Cannot launch in this directory because it does not export a valid application.");
	}

	app.start("package.json", argv.config, argv);
} catch(e) {
	console.log(e.toString());
}