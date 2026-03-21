import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

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
      // Definir papel como host ANTES de entrar no canal (Obrigatório em modo 'live')
      await this.client.setClientRole('host');
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
      
      // Tentar publicar. Se falhar por ser audiência, forçamos a mudança de papel e tentamos de novo.
      try {
        await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
      } catch (publishErr) {
        const agoraErr = publishErr as { code: string; message?: string };
        if (agoraErr.code === 'INVALID_OPERATION' || agoraErr.message?.includes('audience')) {
          console.warn('Tentativa de publicar como audiência. Forçando papel de host...');
          await this.client.setClientRole('host');
          await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
        } else {
          throw publishErr;
        }
      }
      
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

  onUserPublished(callback: (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => void) {
    this.client.on('user-published', callback);
  }

  offUserPublished(callback: (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => void) {
    this.client.off('user-published', callback);
  }

  onUserUnpublished(callback: (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => void) {
    this.client.on('user-unpublished', callback);
  }

  offUserUnpublished(callback: (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => void) {
    this.client.off('user-unpublished', callback);
  }

  async subscribe(user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') {
    await this.client.subscribe(user, mediaType);
  }

  async setRole(role: 'host' | 'audience') {
    await this.client.setClientRole(role);
  }

  async publishTracks() {
    if (!this.localAudioTrack || !this.localVideoTrack) {
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    }
    await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
    return { videoTrack: this.localVideoTrack, audioTrack: this.localAudioTrack };
  }

  async unpublishTracks() {
    if (this.localAudioTrack || this.localVideoTrack) {
      await this.client.unpublish();
      this.localAudioTrack?.stop();
      this.localAudioTrack?.close();
      this.localVideoTrack?.stop();
      this.localVideoTrack?.close();
      this.localAudioTrack = null;
      this.localVideoTrack = null;
    }
  }

  async muteAudio(mute: boolean) {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!mute);
    }
  }

  async muteVideo(mute: boolean) {
    if (this.localVideoTrack) {
      await this.localVideoTrack.setEnabled(!mute);
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

  onUserJoined(callback: (user: IAgoraRTCRemoteUser) => void) {
    this.client.on('user-joined', callback);
  }

  offUserJoined(callback: (user: IAgoraRTCRemoteUser) => void) {
    this.client.off('user-joined', callback);
  }

  onUserLeft(callback: (user: IAgoraRTCRemoteUser) => void) {
    this.client.on('user-left', callback);
  }

  offUserLeft(callback: (user: IAgoraRTCRemoteUser) => void) {
    this.client.off('user-left', callback);
  }
}

export const agoraService = new AgoraService();
