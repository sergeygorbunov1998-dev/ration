from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,time
root=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['python','-m','http.server','8789','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 time.sleep(.8)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content((root/'index.html').read_text())
  page.add_style_tag(content=(root/'style.css').read_text())
  page.evaluate("Object.defineProperty(window, 'localStorage', {value: {getItem(k){return this[k]||null},setItem(k,v){this[k]=String(v)},removeItem(k){delete this[k]}}})")
  page.add_script_tag(content=(root/'app.js').read_text())
  page.screenshot(path='/mnt/data/ration-plus-preview.png',full_page=True)
  assert page.locator('#calLeft').inner_text().replace(' ','')=='2500'
  page.click('#quickAdd')
  page.fill('#mDesc','Тест: творог 200 г')
  page.fill('#mCal','190');page.fill('#mP','42');page.fill('#mF','1');page.fill('#mC','7')
  page.click('#saveMeal');page.wait_for_timeout(100)
  assert page.locator('#calLeft').inner_text()=='2 310',page.locator('#calLeft').inner_text()
  assert '42' in page.locator('#pNumbers').inner_text()
  page.click('#quickWorkout');page.fill('#wkFeeling','Нагрузку перенёс хорошо');page.click('#wkSave');page.wait_for_timeout(100)
  page.click('[data-tab="workouts"]'); assert page.locator('#workoutList [data-workout]').count()==1
  page.click('[data-tab="trends"]');page.click('#recordWeight');page.fill('#wWeight','86.4');page.click('#wSave');page.wait_for_timeout(100)
  assert '86,4' in page.locator('#lastWeight').inner_text()
  page.click('[data-tab="settings"]');page.click('#profileEdit');page.fill('#prName','Тест');page.fill('#prHeight','190');page.fill('#prWeight','86.4');page.fill('#prAge','28');page.click('#prSuggest');assert page.locator('#prCal').input_value()!='';page.click('#prSave');
  assert 'Тест' in page.locator('#profileSwitch').inner_text()
  print('Smoke test completed; runtime errors:',errors)
  browser.close()
finally:server.terminate()
