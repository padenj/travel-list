
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import AppRoutes from './AppRoutes';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

// Force cache bust in development
if (process.env.NODE_ENV === 'development') {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = `/static/css/main.css?v=${Date.now()}`;
  link.as = 'style';
  document.head.appendChild(link);
}

function App(): React.ReactElement {
  return (
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <Router>
          <AppRoutes />
        </Router>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
