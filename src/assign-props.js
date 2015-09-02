import _ from "underscore";

// defines protected, immutable properties
export default function assignProps(obj, props) {
	_.each(props, function(val, key) {
		var opts = {
			configurable: false,
			enumerable: true
		};

		if (typeof val === "function") opts.get = val;
		else {
			opts.value = val;
			opts.writable = false;
		}

		Object.defineProperty(obj, key, opts);
	});
}
