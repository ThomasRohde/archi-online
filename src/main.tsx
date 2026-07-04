import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initLaunchQueue } from './pwa/launch-queue';
import { UpdatePrompt } from './ui/UpdatePrompt';
import 'dockview/dist/styles/dockview.css';
import './styles.css';

// Register before render so the consumer exists when Chromium flushes
// launch-queue file handles for an OS file-handler launch.
initLaunchQueue();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <UpdatePrompt />
  </React.StrictMode>,
);
