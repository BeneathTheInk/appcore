# Appcore

This is a JavaScript application framework that allows us to maintain large, composable Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be separated by functionality while still sharing basic resources.

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
app.use(function() {
	app.log("This is my plugin!");
});

// everything is a plugin, even other apps
app.use(Appcore("myotherapp"));
```

Every app has a life-cycle, maintained through a series of states, starting with initiation and ending when the app is fully running. A plugin has the ability to perform actions on every particular state change and can prevent the app from entering the next state. In this way, app can be initiated asynchronously and without interference.

An app has a total of 3 executing states and one error state, `FAIL`. An app will only enter the failing state if it hasn't reached the `RUNNING` state. Otherwise, it's just a normal error. Here is the order events are performed in:

```txt
INIT -> READY -> RUNNING
```

As a plugin, you can listen for a particular state change by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states have the equivalent methods.

```js
app.use(function() {
	app.ready(function() {
		app.log("My plugin is ready!");
	});
});
```

An app will automatically move on to the next state on the next tick unless prevented by a plugin. The only exception to this is `RUNNING` which will remain the state indefinitely.

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