# Appcore

This is a JavaScript application framework that allows us to maintain large, composable Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be seperated by functionality while still sharing basic resources.

## Install

Build a UMD bundle and use via a script tag. The variable `Appcore` will be attached to `window`.

```html
<script type="text/javascript" src="appcore.js"></script>
```

If using Browserify or Node.js, you can install via Beneath the Ink's private Gemfury NPM registry. See [Gemfury's docs](https://gemfury.com/help/npm-registry) for details on integrating. The following assumes the registry is assigned to the `@beneaththeink` scope.

```sh
$ npm install appcore --scope=@beneaththeink
```

```javascript
var app = require("appcore")("myapp");
```

## Usage

To begin, make a new application instance by passing in a name.

```js
var app = Appcore("myapp");
```

Appcore only helps to maintain large application infrastructure and makes no assumptions about the types of things an application might be doing. Appcore requires all functionality to be "adapted" through plugins so it can maintain compatiblity with the rest of the system. Fortuantely, plugins are easy to add.

```js
app.use(function() {
	app.log("This is my plugin!");
});

// everything is a plugin, even other apps
app.use(Appcore("myotherapp"));
```

Every app has a lifecycle, maintained through a series of states, starting with initiation and ending with the exit. A plugin has the ability to perform actions on every state and prevent the app from entering the next state. In this way, an app can be set up asynchronously and without interference.

An app has a total of 5 executing states and one error state (`FAIL`):

```txt
INIT -> READY -> RUNNING -> SHUTDOWN -> EXIT
```

As a plugin, you can listen for a particular state change by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states, other than `FAIL`, have the equivalent methods.

```js
app.use(function() {
	app.ready(function() {
		app.log("My plugin is ready!");
	});
});
```

An app will automatically move on to the next state on the next tick unless prevented by a plugin. The only exception to this is `RUNNING` which will remain the state until `app.halt()` is called.

As a plugin, you can prevent the app from moving to the next state by using `app.wait()` to create a wait method that can be used asynchronously. In the below example, the ready function will not be called until the async task is finished.

```js
app.use(function() {
	doSomethingAysnc(app.wait());
	app.ready(function() {
		app.log("waited for something async");
	});
});
```

Once all the plugins have been assigned to the application, call `app.start()` with configuration to launch it:

```js
app.start({ log: true });
```

## Building A UMD Bundle

Grunt is used to build a Browserify bundle from the original source found in `lib/`. When the command below completes, the compiled source will be saved to `dist/` directory.

	$ npm install && grunt

If you don't the Grunt cli tools installed globally, run `npm install -g grunt-cli` before running that command.