// Mobile menu functionality
// Mostrar botón de menú solo en móvil
    function checkMobileMenu() {
      const mobileBtn = document.getElementById('mobile-menu-btn');
      if (window.innerWidth <= 768) {
        mobileBtn.style.display = 'block';
      } else {
        mobileBtn.style.display = 'none';
      }
    }

    // Toggle del menú móvil
    document.getElementById('mobile-menu-btn')?.addEventListener('click', function () {
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('sidebar-overlay');

      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });

    // Cerrar menú al hacer click en el overlay
    document.getElementById('sidebar-overlay')?.addEventListener('click', function () {
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('sidebar-overlay');

      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });

    // Cerrar menú al seleccionar una opción
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          const sidebar = document.querySelector('.sidebar');
          const overlay = document.getElementById('sidebar-overlay');

          sidebar.classList.remove('mobile-open');
          overlay.classList.remove('active');
        }
      });
    });

    // Verificar responsive al cargar y redimensionar
    window.addEventListener('load', checkMobileMenu);
    window.addEventListener('resize', checkMobileMenu);
