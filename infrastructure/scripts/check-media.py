import json,urllib.request,urllib.error,http.cookiejar,subprocess,uuid,sys,os,time
from pathlib import Path
import psycopg
root=Path(__file__).resolve().parents[2]
base=os.environ.get('MEDIA_API_URL','http://127.0.0.1:8080')
if not base.startswith(('http://127.0.0.1:', 'http://localhost:')):raise SystemExit('Media fixture is restricted to a local API')
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path,data=None,method='GET',ctype='application/json'):
 headers={}
 if method!='GET':
  csrf=json.load(client.open(base+'/api/auth/csrf'))['token'];headers['X-XSRF-TOKEN']=csrf;headers['Content-Type']=ctype
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if isinstance(data,dict) else data,method=method,headers=headers)
 with client.open(req,timeout=30) as res:
  raw=res.read();return json.loads(raw) if raw and 'json' in res.headers.get('Content-Type','') else raw
email='media-test-'+uuid.uuid4().hex[:8]+'@example.test';password=uuid.uuid4().hex+'A!'
call('/api/auth/register',{'email':email,'password':password,'name':'Media verification'},'POST')
conn=psycopg.connect(os.environ.get('WORKER_DATABASE_URL','postgresql://vybe:vybe_local@localhost:5432/vybe'),autocommit=True)
# Test fixture is local only; no user account is modified.
conn.execute('UPDATE users SET verified=true WHERE email=%s',(email,));conn.execute("INSERT INTO user_roles SELECT id,'ADMIN' FROM users WHERE email=%s",(email,))
call('/api/auth/login',{'email':email,'password':password},'POST')
profile=call('/api/profiles')[0]['id']
slug='signal-study-'+uuid.uuid4().hex[:6]
call('/api/admin/content',{'slug':slug,'title':'VYBE Signal Study','kind':'MOVIE','synopsis':'An original generated color and motion test for the VYBE playback pipeline.','releaseYear':2026,'durationMinutes':1,'language':'No dialogue','rating':'Unrated','artwork':'/art/tears-of-steel.svg','accent':'#365643','attribution':'Original procedural test pattern generated locally with FFmpeg.','sourceUrl':'https://ffmpeg.org/','genres':['Experimental']},'POST')
content=str(conn.execute('SELECT id FROM content WHERE slug=%s',(slug,)).fetchone()[0]);call('/api/admin/content/'+content+'/visibility',{'published':True},'PATCH')
fixture=Path(os.environ.get('MEDIA_FIXTURE',str(root/'work/media-fixture.json')));fixture.parent.mkdir(parents=True,exist_ok=True)
sample=fixture.parent/'media-sample.mp4'
subprocess.run([os.environ.get('FFMPEG_PATH','ffmpeg'),'-y','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=220','-f','lavfi','-i','sine=frequency=440','-map','0:v:0','-map','1:a:0','-map','2:a:0','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=spa','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(sample)],check=True)
boundary=uuid.uuid4().hex
body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.mp4"\r\nContent-Type: video/mp4\r\n\r\n'.encode()+sample.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
asset=call('/api/admin/media/'+content,body,'POST','multipart/form-data; boundary='+boundary)['assetId']
env=os.environ.copy();env.update(WORKER_ONCE='true',FFMPEG_PATH=os.environ.get('FFMPEG_PATH','ffmpeg'),FFPROBE_PATH=os.environ.get('FFPROBE_PATH','ffprobe'))
subprocess.run([sys.executable,str(root/'apps/media-worker/worker.py')],env=env,check=True,timeout=90)
info=call('/api/playback/'+asset+'?profile='+profile);assert info['duration']>7
master=call(info['manifest']);assert b'#EXTM3U' in master
variant=call('/api/playback/'+asset+'/files/360p/index.m3u8');assert b'#EXT-X-ENDLIST' in variant
segment=call('/api/playback/'+asset+'/files/360p/seg_00000.ts');assert len(segment)>1000
session=call('/api/playback/'+asset+'/sessions',{'profile':profile},'POST')['id']
call('/api/playback/sessions/'+session,{'position':3,'ended':False},'PUT');assert call('/api/playback/'+asset+'?profile='+profile)['position']==3
try:urllib.request.urlopen(base+info['manifest']);raise AssertionError('Unauthenticated media access succeeded')
except urllib.error.HTTPError as error:assert error.code==401
subtitle_boundary=uuid.uuid4().hex
subtitle_body=(f'--{subtitle_boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.vtt"\r\nContent-Type: text/vtt\r\n\r\nWEBVTT\n\n00:00.000 --> 00:07.900\nVYBE original test pattern\n\r\n--{subtitle_boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n--{subtitle_boundary}\r\nContent-Disposition: form-data; name="label"\r\n\r\nEnglish test captions\r\n--{subtitle_boundary}--\r\n').encode()
call('/api/admin/media/'+asset+'/subtitles',subtitle_body,'POST','multipart/form-data; boundary='+subtitle_boundary)
series_slug='signal-series-'+uuid.uuid4().hex[:6]
series=call('/api/admin/content',{'slug':series_slug,'title':'VYBE Test Series','kind':'SERIES','synopsis':'Original generated episodic media verification.','releaseYear':2026,'durationMinutes':1,'language':'No dialogue','rating':'Unrated','artwork':'/art/spring.svg','accent':'#365643','attribution':'Original procedural test pattern.','sourceUrl':'https://ffmpeg.org/','genres':['Experimental']},'POST')['id']
episode=call('/api/admin/content/'+series+'/episodes',{'season':1,'number':1,'title':'Signal One','synopsis':'A procedural pilot.','durationMinutes':1},'POST')['id']
call('/api/admin/content/'+series+'/visibility',{'published':True},'PATCH')
episode_body=(f'--{boundary}\r\nContent-Disposition: form-data; name="episode"\r\n\r\n{episode}\r\n'.encode()+body)
episode_asset=call('/api/admin/media/'+series,episode_body,'POST','multipart/form-data; boundary='+boundary)['assetId']
subprocess.run([sys.executable,str(root/'apps/media-worker/worker.py')],env=env,check=True,timeout=90)
assert call('/api/catalog/'+series_slug)['episodes'][0]['playableAssetId']==episode_asset
fixture.write_text(json.dumps({'email':email,'password':password,'asset':asset,'profile':profile,'content':content,'slug':slug,'episodeAsset':episode_asset,'seriesSlug':series_slug}))
fixture.chmod(0o600)
print(json.dumps({'upload':'passed','worker':'passed','manifest':'passed','segmentBytes':len(segment),'progress':'passed','anonymousAccess':'denied','asset':asset}))
