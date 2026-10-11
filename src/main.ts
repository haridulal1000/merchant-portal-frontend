import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { AppConfig } from './app/app.config';

bootstrapApplication(App, AppConfig)
  .catch((err) => console.error(err));
