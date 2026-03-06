import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const APP_ID = '1e2fb47d80dc44f1bd5e9c654ffe0809';

export class AgoraService {
  private client: IAgoraRTCClient;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private localVideoTrack: ICameraVideoTrack | null = null;

  constructor() {
    this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  }

  async joinAndPublish(channelName: string, uid: string | number | null = null, token: string | null = null) {
    await this.client.join(APP_ID, channelName, token, uid);
    
    this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    
    await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
    return { videoTrack: this.localVideoTrack, audioTrack: this.localAudioTrack };
  }

  async joinAsAudience(channelName: string, uid: string | number | null = null, token: string | null = null) {
    await this.client.setClientRole('audience');
    await this.client.join(APP_ID, channelName, token, uid);
    
    this.client.on('user-published', async (user, mediaType) => {
      await this.client.subscribe(user, mediaType);
      if (mediaType === 'video') {
        const remoteVideoTrack = user.videoTrack;
        remoteVideoTrack?.play('remote-player');
      }
      if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    });
  }

  async leave() {
    this.localAudioTrack?.close();
    this.localVideoTrack?.close();
    await this.client.leave();
  }

  onUserJoined(callback: (user: { uid: string | number }) => void) {
    this.client.on('user-joined', callback);
  }

  onUserLeft(callback: (user: { uid: string | number }) => void) {
    this.client.on('user-left', callback);
  }
}

export const agoraService = new AgoraService();
