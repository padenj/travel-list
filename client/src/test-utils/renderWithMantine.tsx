import React from 'react';
import { MantineProvider } from '@mantine/core';
import { render, RenderOptions } from '@testing-library/react';

let mobileViewport = false;

// Call before render to make `useMediaQuery('(max-width: ...)')` queries match.
export function setMobileViewport(value: boolean) {
  mobileViewport = value;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installDomPolyfills() {
  window.matchMedia = ((query: string) => ({
    matches: mobileViewport && query.includes('max-width'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

export function renderWithMantine(ui: React.ReactElement, options?: RenderOptions) {
  installDomPolyfills();
  return render(<MantineProvider env="test">{ui}</MantineProvider>, options);
}
