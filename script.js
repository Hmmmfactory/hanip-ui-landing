const button = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');
const replay = document.querySelector('.play-button');
const furniture = document.querySelectorAll('.furniture');
button.addEventListener('click', () => { const open = nav.classList.toggle('open'); button.setAttribute('aria-expanded', open); button.textContent = open ? 'CLOSE −' : 'MENU +'; });
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); button.textContent = 'MENU +'; }));
replay.addEventListener('click', () => { furniture.forEach((piece) => { piece.style.animation = 'none'; void piece.offsetWidth; piece.style.animation = ''; }); });
