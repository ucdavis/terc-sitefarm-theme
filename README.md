# Sass based SiteFarm One subtheme starterkit

This starterkit is meant as a one-off starting point to customize the SiteFarm
One parent theme. This is perfect for doing simple things like adding or
tweaking some CSS or Javascript. In addition it provides some guidelines for
overriding [Twig](http://twig.sensiolabs.org/) templates which contain the HTML
for the site.

This difference between this and the Basic starterkit is that this one uses Sass
to compile CSS. In addition, it uses browser-native
[Javascript ES Modules (ESM)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules).
This is accomplished via the [ucd-theme-tasks](https://github.com/ucdavis/ucd-theme-tasks/)
package.

General Drupal theming documentation can be found here: [https://www.drupal.org/docs/theming-drupal](https://www.drupal.org/docs/theming-drupal)

# Setup

### Prerequisites

You'll need [node.js](http://nodejs.org).

It is recommended to use [Node Version Manager (NVM)](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
to manage your Node.js versions. This will allow you to easily switch between
Node.js versions for different projects. You can then also create a `.nvmrc`
file in your project to specify the version of Node.js to use.


### Install and start watching for changes

After cloning and changing into that directory, run this to install
dependencies:

```
$ npm install
```

You may have to run that again for updates. **If you have any problems; this is
the first thing to run.**

To do an initial build of the site and start watching for changes while doing
local development run:

```
$ npm start
```

Finally, to bundle everything for production run:

```
$ npm run build
```

# NPM Scripts

The `package.json` file has a handful of scripts that allow you to do a lot of
stuff within your development workflow like compile sass and update on changes.

## Default Tasks

There are 3 main scripts you should be aware of. Just add `npm run` before
each task like `$ npm run build`.

1. **start** - Generate the theme assets and start watching for changes to live
reload in the browser.
2. **build** - Generate the theme with all assets such as css and js.
3. **lint** - Validate CSS and JS by linting.

`$ npm start` is the one most often used and is a shorthand for `npm run start`

### UCD Theme Tasks

The [UCD Theme Tasks](https://www.npmjs.com/package/ucd-theme-tasks) node
package is a CLI tool. You likely will not need to use it directly but it is
good to be aware that the NPM scripts are using it.

If you would like to use it directly then use the `npx` command to use the
locally installed version with your theme.

```
$ npx ucd-theme-tasks --help
```

### Using NPM Scripts with PHPStorm

PHPStorm has a [NPM Tool Window](https://www.jetbrains.com/help/phpstorm/npm-tool-window.html)
for easy use of NPM Scripts. Right-click on the `package.json` file and choose
`Show npm Scripts` to open the window.

Double click `start` to begin watching files for changes.

# Assets (CSS & JS)

To add either CSS or JS, use one of these methods:

### NPM Dependencies

NPM is a Node package manager for the web. It is useful for adding third party
libraries for both development and site inclusion.

Install any [NPM](https://www.npmjs.com/) component with the `--save` flag. You
can search for anything that NPM can install and run:

    $ npm install {thing} --save

Use `--save` when a package needs to be added as a dependency to the browser.

Use `--save-dev` when a package is only needed for development like Sass
libraries.

The JS in NPM Dependencies *will not* automatically be compiled and added to
production javascript.

[Vite](https://vitejs.dev/) is used to compile all NPM packages into
[Javascript ES Modules (ESM)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
that the browser can read. Adding a Javascript package into your code is as easy
as using an `import`.

```js
import package from 'package';
```

# Browser Reloading

In order for the browser to reload on each sass/js change, be sure that your
`settings.local.php` file has the following setting. Doing a `fin themer/init`
should do this automatically for you.

🚩 Be sure to uncomment the `'useDevServer' => TRUE,` line to watch for changes.

```php
/**
 * Use Hot Module Replacement to reload pages with Vite on js/css change.
 */
$settings['vite'] = [
  // Uncomment the line below to watch for changes during development.
  //'useDevServer' => TRUE,
  
  // Disable the base sitefarm_one theme watch.
  'overrides' => [
    'sitefarm_one' => [
      'useDevServer' => FALSE,
    ]
  ],

  // Vite dev server url, by default http://localhost:5173.
  // 'devServerUrl' => 'http://127.0.0.1:5173',
];
```

# Folder Structure

```
|-- 📁 config/
|-- 📁 dist/
|-- 📁 images/
|-- 📁 js/
|-- 📁 node_modules/
|-- 📁 sass/
|-- 📁 templates/
|-- .eslintrc.yml
|-- .gitignore
|-- .stylelintrc.yml
|-- logo.svg
|-- package.json
|-- package-lock.json
|-- vite.config.mjs
|-- THEMENAME.info
|-- THEMENAME.libraries.yml
|-- THEMENAME.theme
```

## 1. config/
This folder contains configuration that is installed only on the initial
install.

**install/THEMENAME.settings.yml**: This file contains all
default settings and should initially be a clone of what is in the
sitefarm_one.settings.yml file.

[https://www.drupal.org/docs/8/theming-drupal-8/creating-advanced-theme-settings](https://www.drupal.org/docs/8/theming-drupal-8/creating-advanced-theme-settings)

**schema/THEMENAME.schema.yml**: This file is used by Drupal to
provide translations for items like the THEMENAME.settings.yml file.

[https://www.drupal.org/docs/drupal-apis/configuration-api/configuration-schemametadata](https://www.drupal.org/docs/drupal-apis/configuration-api/configuration-schemametadata)

## 2. dist/
Sass and Javascript are compiled into minified CSS and Javascript files. Files
in this directory are auto-generated so should never be manually edited. This is
what Drupal looks to for production ready assets.

## 3. images/
Image files like jpeg, gif, png, or svg should be added to this directory.

## 4. js/
Javascript files belong in this directory. A default main.js file is already
available for use. All files will be referenced from `/dist/main.js`.

**main.js**: This file contains an [ESM](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
import of the `modules/example.js` file. Also a Drupal Behavior called
`customBehavior` has been added as an example. Behaviors are helpful for
allowing your javascript to work nicely with Drupal and Drupal's Ajax system.

More information on using Javascript in Drupal can be found here: [https://www.drupal.org/docs/drupal-apis/javascript-api/javascript-api-overview](https://www.drupal.org/docs/drupal-apis/javascript-api/javascript-api-overview)

## 5. node_modules/
This directory does not exist by default, but it will be created automatically
once `npm install` is run. This directory should never be edited, and it should
not be committed to git.

## 6. sass/
All (S)CSS files should go in this directory.

**style.scss**: This is the master file for all scss. All partials in
`/sass/component/` should be imported here using [@use](https://sass-lang.com/documentation/at-rules/use).
Styles should ideally go into individual component files rather than directly
into this file. This will compile to `/dist/style.css`.

If you want to use variables and mixins from SiteFarm One, you will need to
uncomment the `@use` lines with
`@use "../../../../profiles/sitefarm/themes/sitefarm_one/sass/1_pattern_lab/0_tools" as *;`
and ensure that the path to the SiteFarm One theme is correct.

> ⚠️ **WARNING** There is no guarantee that Sitefarm One mixins and files won't
> change in the future. So you should be prepared to fix your theme if Sitefarm
> changes sass partials in the main "Sitefarm One" theme. **You are responsible**
> to ensure you stay up to date with any changes in sitefarm_one.

**ckeditor.scss**: When using the CKEditor WYSIWYG, it is helpful to see the styles
which will be applied in the actual theme. This file allows styles to be
injected into the editor so that a user gets a better idea of how text and
components like buttons, lists, and links will really look. Sitefarm One already
provides many defaults, so most likely this file will not have much in it. This
will compile to `/dist/ckeditor.css`.

## 7. templates/
The `templates` directory allows [Twig](https://twig.symfony.com/) files to be
added so that HTML markup can be overridden or customized. These files end with
`.html.twig`. For example: `block.html.twig` or `node--teaser.html.twig`.

Drupal auto-detects twig files based on [naming conventions](https://www.drupal.org/docs/8/theming/twig/twig-template-naming-conventions).
So if you name a Twig file correctly, Drupal will automatically use it.

In addition, you can suggest templates for use when certain conditions are met.

This link provides documentation for working with Drupal 8 templates:
[https://www.drupal.org/docs/theming-drupal/twig-in-drupal/working-with-twig-templates](https://www.drupal.org/docs/theming-drupal/twig-in-drupal/working-with-twig-templates)

## Files
**.eslintrc.yml**: This file sets the rules for doing Javascript
linting/validation. A predefined coding style is set, but you may edit it to a
syntax that is preferable.

[ESLint rule documentation](http://eslint.org/docs/rules/)

**.gitignore**: This tells Git what files and directories should not be
committed to a Git repository. You may add in extra items to ignore.

**.stylelintrc.yml**: Configuration rules for how Sass should be
linted/validated. It already contains sensible defaults for coding guidelines,
but you may edit as needed.

[Stylelint rule documentation](https://stylelint.io/user-guide/rules/list)

**logo.svg**: This image file should be replaced with your site's own logo file.
It should be named `logo.EXTENSION`. It's preferable to use a `.svg` file.
Although regular `.jpeg` and `.png` files are acceptable.

**package.json**: This is the main file used by Node to declare any NPM packages
that will be used for things like Gulp. Likely you will not need to edit this
file unless there are specific Node packages you need.

**package-lock.json**: (auto-generated by `npm install`) This is a Lock file so that everyone on your team will
be sure to install the exact same Node packages.

**vite.config.mjs**: Master file used by Vite for defining how the theme
should compile assets. It extends the defaults provided by `ucd-theme-tasks` but
can easily be changed to suit your theme's needs.

[Vite config documentation](https://vitejs.dev/config/)

If you need to extend the Vite configuration, you can do so with:
```js
/**
 * Example of how to extend the default configuration.
 */
import defaultConfig from 'ucd-theme-tasks/vite.config.mjs'
import { defineConfig, mergeConfig } from 'vite'

// Add custom config here such as changing the server host url.
const customConfig = {
  server: {
    host: '0.0.0.0',
  }
}

// Combine the custom config with the default sitefarm config.
export default defineConfig(() =>
  mergeConfig(defaultConfig, customConfig),
)
```

**THEMENAME.info**: This is the main file which declares a theme to Drupal. It
contains information about the theme, declares the parent theme, adds libraries,
and declares regions where content can be placed. It also allows for [overriding
libraries](https://www.drupal.org/docs/8/theming-drupal-8/adding-stylesheets-css-and-javascript-js-to-a-drupal-8-theme#override-extend)
in the parent SiteFarm One theme.

[https://www.drupal.org/docs/8/theming-drupal-8/defining-a-theme-with-an-infoyml-file](https://www.drupal.org/docs/8/theming-drupal-8/defining-a-theme-with-an-infoyml-file)

**THEMENAME.libraries**: Libraries for CSS and Javascript can be defined here.
By default this file declares 1 CSS file and 1 Javascript file. These will be
loaded into the site. More libraries or dependencies can be declared if needed.

[https://www.drupal.org/docs/theming-drupal/adding-stylesheets-css-and-javascript-js-to-a-drupal-theme](https://www.drupal.org/docs/theming-drupal/adding-stylesheets-css-and-javascript-js-to-a-drupal-theme)

💡 To instruct the libraries to be compiled with Vite, add a `vite: true` key to
the library definition. As well, set the file path to the source such as 
`sass/style.scss` rather than the destination of the compiled code
`dist/style.css`.

**THEMENAME.theme**: This file is for more advanced users. It allows a developer to
alter Drupal's output before it gets to a Twig template. It uses PHP and Drupal
Hooks to change variables and data that is eventually passed to a template. This
is also where any theme suggestions would be located.

[https://www.drupal.org/docs/8/theming-drupal-8/modifying-attributes-in-a-theme-file](https://www.drupal.org/docs/8/theming-drupal-8/modifying-attributes-in-a-theme-file)
