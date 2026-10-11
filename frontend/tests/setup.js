import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
// jsdom has no layout: scrollIntoView and print are no-ops here
window.HTMLElement.prototype.scrollIntoView = () => {};
window.print = () => {};
window.confirm = () => true;
