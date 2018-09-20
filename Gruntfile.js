module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        typedoc: {
            build: {
                options: {
                    module: 'commonjs',
                    out: './docs',
                    name: 'face-command-server',
                    target: 'es2018'
                },
                src: ['./src/**/*']
            }
        },
        ts: {
            default : {
              outDir: "lib",
              tsconfig: './tsconfig.json'
            }
        }
    });

    grunt.loadNpmTasks('grunt-typedoc');
    grunt.loadNpmTasks("grunt-ts");
    
    grunt.registerTask('default', ['ts']);

    grunt.registerTask('docs', ['typedoc']);
};