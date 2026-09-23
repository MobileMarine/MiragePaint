import { Component } from '@angular/core';
import { EditorComponent } from './editor/editor.component';

@Component({
  selector: 'app-root',
  imports: [EditorComponent],
  template: `<app-editor />`,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class App {}
