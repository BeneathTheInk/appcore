# Appcore

This is a JavaScript application framework that allows us to maintain large, composable, isomorphic Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be separated by functionality while still sharing basic resources.

## Plugins

Here is a list of existing plugins that can be used with Appcore.

- [appcore-log](https://beneaththeink.beanstalkapp.com/appcore-log) - Adds standarized console logging methods.
- [appcore-cli](https://beneaththeink.beanstalkapp.com/appcore-cli) - A CLI tool for running Appcore apps.
- [appcore-browser](https://beneaththeink.beanstalkapp.com/appcore-browser) - A Node.js API for managing HTML5 Appcore apps.
- [appcore-router](https://beneaththeink.beanstalkapp.com/appcore-router) - Adds Express for Node.js, Backbone Router for the browser.
- [appcore-auth](https://beneaththeink.beanstalkapp.com/appcore-auth) - A generic API for authenticating users against different backends.
- [appcore-files](https://beneaththeink.beanstalkapp.com/appcore-files) - A generic API for handling file data with any kind of storage.
	- [appcore-s3](https://beneaththeink.beanstalkapp.com/appcore-s3) - An appcore-file adaptor for Amazon S3.
- [appcore-sendmail](https://beneaththeink.beanstalkapp.com/appcore-sendmail) - A generic API for sending emails.
	- [appcore-mailgun](https://beneaththeink.beanstalkapp.com/appcore-mailgun) - An appcore-sendmail adaptor for sending emails through Mailgun.
- [appcore-mongoose](https://beneaththeink.beanstalkapp.com/appcore-mongoose) - Attaches a Mongoose connection and database to the Appcore app.
- [appcore-sockets](https://beneaththeink.beanstalkapp.com/appcore-sockets) - Adds Websocket support for the browser and the server with Socket.io.

## Install

Build a UMD bundle and use via a script tag. The variable `Appcore` will be attached to `window`.

```html
<script type="text/javascript" src="appcore.js"></script>
```

```js
var app = Appcore("myapp");
```

If using Browserify or Node.js, you can install via Beneath the Ink's private Gemfury NPM registry. See [Gemfury's docs](https://gemfury.com/help/npm-registry) for details on integrating with NPM scopes.

```sh
$ npm install @beneaththeink/appcore
```

```js
var app = require("@beneaththeink/appcore")("myapp");
```

## Usage

To begin, make a new application instance by passing in a name.

```js
var app = Appcore("myapp");
```

Appcore only helps to maintain large application infrastructure and makes no assumptions about the types of things an application might be doing. Appcore requires all functionality to be "adapted" through plugins so it can maintain compatibility with the rest of the system. Fortunately, plugins are easy to add:

```js
// plugins are functions
app.use(function() {
	console.log("This is my plugin!");
});

// or other apps
app.use(Appcore("myotherapp"));
```

Every app has a life-cycle, maintained through a series of states, starting with boot and ending when the app is fully running. Applications always want to enter the next state and will automatically do so unless prevented by a plugin using the `wait()` method. In this way, app functionality can be initiated asynchronously, without interference from other plugins. The only exception to this is the `FAIL` and `RUNNING` states which remain indefinitely.

An app has a total of 4 executing states and one error state, `FAIL`. An app will only enter the failing state if it hasn't reached the `RUNNING` state. After the running state, errors are handled as normal. Here is the order states are performed in:

```txt
PREBOOT -> STARTUP -> READY -> RUNNING
```

Applications are started immediately in the `PREBOOT` state. The `.use()` method will execute plugins when the app enters the `STARTUP` state, at least one tick later. As a plugin, you can listen for future state by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states have the equivalent methods.

```js
// log when app is ready
app.ready(function() {
	console.log("My plugin is ready!");
});

// above is the equivalent of
app.startup(function() {
	app.ready(function() {
		console.log("My plugin is ready!");
	});
});
```

As a plugin, you can prevent the app from moving to the next state by using `app.wait()` to create a wait method that can be used asynchronously. In the below example, the `.next()` function will not be called until the async task is finished.

```js
app.use(function() {
	doSomethingAsync(app.wait(function(err) {
		// app enters FAIL state
		if (err) return app.error(err);

		// or app continues
		console.log("did something async.");
	}));

	// log on the next state, READY
	app.next(function() {
		console.log("app has entered the next state!");
	});
});
```

Once an application is constructed it will continue running until told not to. Make sure to apply all configuration before the `STARTUP` state, so plugins get the correct information when run.

```js
// guaranteed to run before plugins
app.preboot(function() {
	// applied synchronously
	app.set("myplugin", { do: "something" });

	// or asynchronously
	getAsyncConfig(app.wait(function(err, config) {
		if (err) return app.error(err);
		app.set(config);
	}));
});

// will wait until async config has loaded
app.use(function() {
	var options = app.get("myplugin");
});
```

Application can be created as classes, so they can be extended and reused. Use the `.create()` or `.extend()` methods:

```js
var Subapp = Appcore.create("my app", function(options) {
	this.set(options);
	this.use(function() {
		console.log("A custom application.");
	});
});

var app = Subapp({ init: "config" });
```

## Building A UMD Bundle

Grunt is used to build a Browserify bundle from the original source found in `lib/`. When the command below completes, the compiled and minified source will be saved to `dist/` directory. These files can be used with most JavaScript interpreters such as Node.js and browsers.

	$ npm run prepublish

## Testing

We have written several unit tests for Appcore. If you find a bug or add a feature, please add a few tests to the `test/` folder. Run the command below to test Appcore on your machine:

	$ npm test

You can also run the tests in your browser. You should have [browser-run](http://ghub.io/browser-run) and [browserify](http://ghub.io/browserify) installed globally.

	$ browserify test/* | browser-run -b chrome
