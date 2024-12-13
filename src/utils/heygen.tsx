import { useRef } from 'react';

export function useHeygen(apiKey: string, serverUrl: string) {

    if (!apiKey || !serverUrl) {
        throw new Error('Heygen -> Both apiKey and serverUrl are required.');
    }

    const avatarID = '336b72634e644335ad40bd56462fc780';
    const voiceID = '613f8304431144918ed6a83d4b3e3196';
    const sessionInfoRef = useRef<any>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const mediaElementRef = useRef<HTMLVideoElement | null>(null);

    const heygenUpdateStatus = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
    };

    async function heygenStart() {
        try {
            await heygenCreateNewSession();
            await heygenStartStreamingSession();
        } catch (error) {
            const err = error as Error;
            console.error('Error starting session:', err);
            heygenUpdateStatus(`Error: ${err.message}`);
        }
    }

    async function heygenEnd() {
        try {
            await heygenCloseSession();
        } catch (error) {
            const err = error as Error;
            console.error('Error starting session:', err);
            heygenUpdateStatus(`Error: ${err.message}`);
        }
    }

    const heygenCreateNewSession = async () => {
        try {
            const response = await fetch(`${serverUrl}/v1/streaming.new`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({
                    quality: 'high',
                    avatar_name: avatarID,
                    voice: { voice_id: voiceID },
                    background: { type: 'color', value: '#FAFAFA' },
                }),
            });

            const data = await response.json();
            sessionInfoRef.current = data.data;

            const { sdp: serverSdp, ice_servers2: iceServers } = data.data;
            const pc = new RTCPeerConnection({ iceServers });

            pc.ontrack = (event) => {
                if (event.track.kind === 'audio' || event.track.kind === 'video') {
                    if (mediaElementRef.current) {
                        const stream = event.streams[0];

                        // Log para depuração
                        console.log("MediaStream recebida:", stream);
                        console.log("Tracks:", stream.getTracks());
                        console.log("Vídeo Tracks:", stream.getVideoTracks());
                        console.log("Áudio Tracks:", stream.getAudioTracks());

                        mediaElementRef.current.srcObject = stream;
                    }
                    heygenUpdateStatus('Received media stream');
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(serverSdp));
            peerConnectionRef.current = pc;
            heygenUpdateStatus('Session created successfully');
        } catch (error: any) {
            heygenUpdateStatus(`Error creating session: ${error.message}`);
        }
    };

    const heygenStartStreamingSession = async () => {
        if (!peerConnectionRef || !sessionInfoRef) return;

        try {
            const localDescription = await peerConnectionRef.current!.createAnswer();
            await peerConnectionRef.current!.setLocalDescription(localDescription);

            peerConnectionRef.current!.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    heygenHandleICE(sessionInfoRef.current.session_id, candidate.toJSON());
                }
            };

            peerConnectionRef.current!.oniceconnectionstatechange = () => {
                heygenUpdateStatus(`ICE Connection State: ${peerConnectionRef.current!.iceConnectionState}`);
            };

            await fetch(`${serverUrl}/v1/streaming.start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({ session_id: sessionInfoRef.current.session_id, sdp: localDescription }),
            });

            heygenUpdateStatus('Streaming started successfully');
        } catch (error: any) {
            heygenUpdateStatus(`Error starting streaming: ${error.message}`);
        }
    };

    const heygenHandleICE = async (session_id: string, candidate: any) => {
        try {
            await fetch(`${serverUrl}/v1/streaming.ice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({ session_id, candidate }),
            });
        } catch (error: any) {
            heygenUpdateStatus(`Error handling ICE candidate: ${error.message}`);
        }
    };

    const heygenSendText = async (texto: string) => {
        if (!sessionInfoRef) {
            heygenUpdateStatus('No active session');
            return;
        }

        if (texto.length == 0) {
            heygenUpdateStatus('No message to be sent');
            return;
        }

        try {
            await fetch(`${serverUrl}/v1/streaming.task`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({ session_id: sessionInfoRef.current.session_id, text: texto }),
            });

            heygenUpdateStatus(`Sent text: ${texto}`);
        } catch (error: any) {
            heygenUpdateStatus(`Error sending text: ${error.message}`);
        }
    };

    const heygenCloseSession = async () => {
        if (!sessionInfoRef) return;

        try {
            await fetch(`${serverUrl}/v1/streaming.stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({ session_id: sessionInfoRef.current.session_id }),
            });

            peerConnectionRef.current?.close();
            peerConnectionRef.current = null;
            sessionInfoRef.current = null;
            if (mediaElementRef.current) {
                mediaElementRef.current.srcObject = null;
            }

            heygenUpdateStatus('Session closed');
        } catch (error: any) {
            heygenUpdateStatus(`Error closing session: ${error.message}`);
        }
    };

    return {
        heygenStart,
        heygenEnd,
        heygenSendText,
        mediaElementRef,
    }
};