import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const APP_ID = '4cc52d49125644ab8adc2bea9593f1e0';

export class AgoraService {
  private client: IAgoraRTCClient;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private localVideoTrack: ICameraVideoTrack | null = null;

  constructor() {
    this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  }

  async joinAndPublish(channelName: string, uid: string | number | null = null, token: string | null = null) {
    if (this.client.connectionState !== 'DISCONNECTED') {
      await this.leave();
    }
    
    try {
      await this.client.join(APP_ID, channelName, token, uid);
    } catch (err) {
      const agoraErr = err as { code: string; message: string };
      if (agoraErr.code === 'OPERATION_ABORTED') {
        console.warn('Operação de join abortada (provavelmente o utilizador saiu rapidamente).');
        return null;
      }
      if (agoraErr.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
        console.error('Erro de Autenticação Agora: O App ID pode exigir um Token. Tenta desativar "App Certificate" no console da Agora ou fornecer um token.');
      }
      throw err;
    }
    
    // Se chegamos aqui e o estado mudou para DISCONNECTED (devido a um leave rápido), paramos
    if (this.client.connectionState === 'DISCONNECTED') return null;

    try {
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      
      await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
      return { videoTrack: this.localVideoTrack, audioTrack: this.localAudioTrack };
    } catch (err) {
      const agoraErr = err as { code: string };
      if (agoraErr.code === 'OPERATION_ABORTED') {
        console.warn('Operação de publish abortada.');
        return null;
      }
      throw err;
    }
  }

  async joinAsAudience(channelName: string, uid: string | number | null = null, token: string | null = null) {
    if (this.client.connectionState !== 'DISCONNECTED') {
      await this.leave();
    }
    
    await this.client.setClientRole('audience');
    
    try {
      await this.client.join(APP_ID, channelName, token, uid);
    } catch (err) {
      const agoraErr = err as { code: string; message: string };
      if (agoraErr.code === 'OPERATION_ABORTED') {
        console.warn('Operação de join (audience) abortada.');
        return;
      }
      if (agoraErr.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
        console.error('Erro de Autenticação Agora: O App ID pode exigir um Token.');
      }
      throw err;
    }
    
    this.client.on('user-published', async (user, mediaType) => {
      try {
        await this.client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const remoteVideoTrack = user.videoTrack;
          remoteVideoTrack?.play('remote-player');
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      } catch (err) {
        console.error('Erro ao subscrever utilizador remoto:', err);
      }
    });
  }

  async leave() {
    try {
      this.localAudioTrack?.stop();
      this.localAudioTrack?.close();
      this.localVideoTrack?.stop();
      this.localVideoTrack?.close();
      this.localAudioTrack = null;
      this.localVideoTrack = null;
      
      if (this.client.connectionState !== 'DISCONNECTED') {
        await this.client.leave();
      }
    } catch (err) {
      console.error('Erro ao sair da live:', err);
    }
  }

  onUserJoined(callback: (user: { uid: string | number }) => void) {
    this.client.on('user-joined', callback);
  }

  onUserLeft(callback: (user: { uid: string | number }) => void) {
    this.client.on('user-left', callback);
  }
}

export const agoraService = new AgoraService();
