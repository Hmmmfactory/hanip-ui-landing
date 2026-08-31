(function(){
  var key = 'runday-editorial-kit-progress';
  var inputs = Array.prototype.slice.call(document.querySelectorAll('.done input'));
  var count = document.getElementById('count');
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { saved = {}; }
  function render(){
    var complete = 0;
    inputs.forEach(function(input, index){ input.checked = Boolean(saved[index]); if(input.checked) complete++; });
    count.textContent = complete;
  }
  inputs.forEach(function(input, index){ input.addEventListener('change', function(){ saved[index] = input.checked; localStorage.setItem(key, JSON.stringify(saved)); render(); }); });
  document.querySelectorAll('.copy').forEach(function(button){ button.addEventListener('click', async function(){
    var text = document.getElementById(button.dataset.copy).textContent.trim();
    try { await navigator.clipboard.writeText(text); button.textContent = '복사됨'; setTimeout(function(){ button.textContent = '복사'; }, 1400); }
    catch(e) { button.textContent = '직접 선택'; }
  }); });
  document.getElementById('reset').addEventListener('click', function(){ saved = {}; localStorage.removeItem(key); render(); });
  render();
}());
