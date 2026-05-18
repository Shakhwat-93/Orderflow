import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { installStoragePolyfills } from './platform/storage';
import { isNativeApp } from './platform/runtime';

installStoragePolyfills();

if (isNativeApp()) {
  document.body.classList.add('native-app');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
