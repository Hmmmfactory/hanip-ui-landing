const button = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');
button.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  button.setAttribute('aria-expanded', open);
  button.textContent = open ? '닫기' : '메뉴';
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '메뉴';
}));
