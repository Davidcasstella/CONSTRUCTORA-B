// Pre-render auth check: prevents login flash if already authenticated
(function () {
      if (localStorage.getItem('authToken')) {
        var s = document.createElement('style');
        s.id = 'pre-auth-style';
        s.textContent = '.login-overlay{display:none!important}#dashboard-wrapper{display:flex!important}';
        document.head.appendChild(s);
      }
    })();
