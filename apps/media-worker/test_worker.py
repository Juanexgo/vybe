import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import worker

class MediaEncodingTest(unittest.TestCase):
    def test_real_ffmpeg_hls_does_not_upscale(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            source=root/'sample.mp4'
            subprocess.run([worker.FFMPEG,'-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',str(source)],check=True,timeout=30)
            width,height,duration,variants=worker.transcode(source,root/'out')
            self.assertEqual((width,height),(320,180))
            self.assertEqual([v['height'] for v in variants],[180])
            self.assertGreater(duration,0)
            self.assertIn('180p/index.m3u8',(root/'out/master.m3u8').read_text())
            self.assertIn('#EXT-X-ENDLIST',(root/'out/180p/index.m3u8').read_text())
            self.assertTrue(list((root/'out/180p').glob('*.ts')))
    def test_fake_video_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'fake.mp4';source.write_text('This is not video.')
            with self.assertRaises(subprocess.CalledProcessError):worker.probe(source)

class MultipleAudioTest(unittest.TestCase):
    def test_two_audio_languages_produce_separate_hls_tracks(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'multiaudio.mp4'
            subprocess.run([worker.FFMPEG,'-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=220','-f','lavfi','-i','sine=frequency=440','-map','0:v','-map','1:a','-map','2:a','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=spa','-t','1','-c:v','libx264','-c:a','aac',str(source)],check=True,timeout=30)
            worker.transcode(source,root/'out');master=(root/'out/master.m3u8').read_text()
            self.assertEqual(master.count('#EXT-X-MEDIA:TYPE=AUDIO'),2)
            self.assertIn('LANGUAGE="spa"',master)
            for index in range(2):self.assertTrue(list((root/f'out/audio{index}').glob('*.ts')))

if __name__=='__main__':unittest.main()
