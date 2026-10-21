import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { config } from './app/app.config.server';

/** El arranque del prerender (T360, SPEC-seo.md D2): lo usa el build, nunca un servidor. */
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
