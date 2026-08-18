// Must come first: this snapshots the auth params out of the URL before
// supabase-js initializes and erases the fragment. See lib/authRedirect.ts.
import './lib/authRedirect';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* History-API routing; netlify.toml already serves index.html for any path */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);