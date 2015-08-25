const gulp = require('gulp');
const concat = require('gulp-concat');
const pkg = require('./package.json');

gulp.task('default', ['css', 'js'], function () {
    console.log("done building project "+pkg.name);
});

gulp.task('css', function () {

    return gulp
        .src('src/**/*.css')
        .pipe(concat(pkg.name + '.css'))
        .pipe(gulp.dest('dist/'));
});

gulp.task('js', function () {
    return gulp
        .src('src/**/*.js')
        .pipe(concat(pkg.name + ".js"))
        .pipe(gulp.dest('dist/'));
});
