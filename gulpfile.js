const gulp = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const rename = require("gulp-rename");
const templateCache = require('gulp-angular-templatecache');
const pkg = require('./package.json');

gulp.task('default', ['css'], function () {
    console.log("done building project " + pkg.name);
});

gulp.task('css', ['templates'], function () {
    return gulp
        .src('src/**/*.css')
        .pipe(concat(pkg.name + '.css'))
        .pipe(gulp.dest('dist/'));
});

gulp.task('templates', ['uglify'], templateCacheCB);

gulp.task('uglify', ['concat'], function () {
    return gulp
        .src('dist/' + pkg.name + '.js')
        .pipe(uglify({mangle: false}))
        .pipe(rename(pkg.name + '.min.js'))
        .pipe(gulp.dest('dist/'));
});

gulp.task('concat', function () {
    return gulp
        .src(['src/**/*.js'])
        .pipe(concat(pkg.name + ".js"))
        .pipe(gulp.dest('dist/'));
});

function templateCacheCB() {
    console.log("converting HTML to angular templates and storing in template caches");
    return gulp.src('src/templates/**/*.html')
        .pipe(templateCache({filename: "Templates.js", module: pkg.name}))
        .pipe(gulp.dest('src/'));
}