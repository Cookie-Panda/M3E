if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log('M3E Player ServiceWorker registered: ', registration.scope);
      })
      .catch((err) => {
        console.log('M3E Player ServiceWorker registration failed: ', err);
      });
  });
}
