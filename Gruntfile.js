module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: {
			lib: "lib/",
			dist: "dist/"
		},
		babel: {
			dist: {
				files: [{
					expand: true,
					cwd: "src/",
					src: [ "*.js" ],
					dest: "lib/",
					isFile: true
				}]
			}
		},
		browserify: {
			dist: {
				src: "src/appcore.js",
				dest: "dist/appcore.js",
				options: {
					transform: [ "babelify" ],
					browserifyOptions: {
						debug: true,
						standalone: "Appcore"
					}
				}
			}
		},
		exorcise: {
			dist: {
				src: "dist/appcore.js",
				dest: "dist/appcore.js.map"
			}
		},
		uglify: {
			dist: {
				src: "dist/appcore.js",
				dest: "dist/appcore.min.js",
				options: {
					sourceMap: true,
					sourceMapIn: "dist/appcore.js.map",
					sourceMapIncludeSources: true
				}
			}
		},
		concat: {
			main: {
				files: [{
					expand: true,
					cwd: "dist/",
					src: [ "*.js" ],
					dest: "dist/",
					isFile: true
				}],
				options: {
					banner: "/*\n * Appcore v<%= pkg.version %> \n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n */\n\n"
				}
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-babel');
	grunt.loadNpmTasks('grunt-exorcise');

	grunt.registerTask('build-lib', [ 'clean:lib', 'babel' ]);
	grunt.registerTask('build-bundle', [ 'clean:dist', 'browserify', 'exorcise', 'uglify', 'concat' ]);
	grunt.registerTask('dist', [ 'build-lib', 'build-bundle' ]);
	grunt.registerTask('default', [ 'dist' ]);

};
