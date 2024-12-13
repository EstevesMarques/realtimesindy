import React, { useState, useRef, useEffect } from 'react';
import './StreamingSession.scss';

type StreamingSessionProps = {
    apiKey: string;
    serverUrl: string;
};

const StreamingSession: React.FC<StreamingSessionProps> = ({ apiKey, serverUrl }) => {
    const [status, setStatus] = useState<string[]>([]);
    const [avatarID, setAvatarID] = useState<string>('');
    const [voiceID, setVoiceID] = useState<string>('613f8304431144918ed6a83d4b3e3196');
    const [taskInput, setTaskInput] = useState<string>('');
    //const [sessionInfo, setSessionInfo] = useState<any>(null);
    //const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
    const sessionInfoRef = useRef<any>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const mediaElement = useRef<HTMLVideoElement | null>(null);

    const updateStatus = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setStatus((prev) => [...prev, `[${timestamp}] ${message}`]);
    };


    async function handleStart() {
        try {
            await createNewSession();
            await startStreamingSession();
            await sendText('Olá, para iniciarmos o atendimento, informe o seu número de telefone com DDD.');
        } catch (error) {
            const err = error as Error;
            console.error('Error starting session:', err);
            updateStatus(`Error: ${err.message}`);
        }
    }


    const createNewSession = async () => {
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
            //setSessionInfo(data.data);
            sessionInfoRef.current = data.data;

            const { sdp: serverSdp, ice_servers2: iceServers } = data.data;
            const pc = new RTCPeerConnection({ iceServers });

            pc.ontrack = (event) => {
                if (event.track.kind === 'audio' || event.track.kind === 'video') {
                    if (mediaElement.current) {
                        const stream = event.streams[0];

                        // Log para depuração
                        console.log("MediaStream recebida:", stream);
                        console.log("Tracks:", stream.getTracks());
                        console.log("Vídeo Tracks:", stream.getVideoTracks());
                        console.log("Áudio Tracks:", stream.getAudioTracks());

                        mediaElement.current.srcObject = stream;
                    }
                    updateStatus('Received media stream');
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(serverSdp));
            //setPeerConnection(pc);
            peerConnectionRef.current = pc;
            updateStatus('Session created successfully');
        } catch (error: any) {
            updateStatus(`Error creating session: ${error.message}`);
        }
    };

    const startStreamingSession = async () => {
        //if (!peerConnection || !sessionInfo) return;
        if (!peerConnectionRef || !sessionInfoRef) return;

        try {
            const localDescription = await peerConnectionRef.current!.createAnswer();
            await peerConnectionRef.current!.setLocalDescription(localDescription);

            peerConnectionRef.current!.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    handleICE(sessionInfoRef.current.session_id, candidate.toJSON());
                }
            };

            peerConnectionRef.current!.oniceconnectionstatechange = () => {
                updateStatus(`ICE Connection State: ${peerConnectionRef.current!.iceConnectionState}`);
            };

            await fetch(`${serverUrl}/v1/streaming.start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey,
                },
                body: JSON.stringify({ session_id: sessionInfoRef.current.session_id, sdp: localDescription }),
            });

            updateStatus('Streaming started successfully');
        } catch (error: any) {
            updateStatus(`Error starting streaming: ${error.message}`);
        }
    };

    const handleICE = async (session_id: string, candidate: any) => {
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
            updateStatus(`Error handling ICE candidate: ${error.message}`);
        }
    };

    const sendText = async (texto: string) => {
        if (!sessionInfoRef) {
            updateStatus('No active session');
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

            updateStatus(`Sent text: ${texto}`);
            setTaskInput('');
        } catch (error: any) {
            updateStatus(`Error sending text: ${error.message}`);
        }
    };

    const closeSession = async () => {
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

            //setPeerConnection(null);
            //setSessionInfo(null);
            peerConnectionRef.current?.close();
            peerConnectionRef.current = null;
            sessionInfoRef.current = null;
            if (mediaElement.current) {
                mediaElement.current.srcObject = null;
            }

            updateStatus('Session closed');
        } catch (error: any) {
            updateStatus(`Error closing session: ${error.message}`);
        }
    };

    return (
        <div data-component="StreamingSession">
            <div className="container">
                <div className="controls">
                    <input
                        type="text"
                        value={avatarID}
                        onChange={(e) => setAvatarID(e.target.value)}
                        placeholder="Avatar ID"
                    />
                    <input
                        type="text"
                        value={voiceID}
                        onChange={(e) => setVoiceID(e.target.value)}
                        placeholder="Voice ID"
                    />
                    <button onClick={handleStart}>Start</button>
                    <button onClick={closeSession}>Close</button>
                </div>
                <div className="controls">
                    <input
                        type="text"
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        placeholder="Enter text for avatar to speak"
                    />
                    <button onClick={()=> sendText('')}>Talk</button>
                </div>
                <video ref={mediaElement} autoPlay className="media-player" />
                <div className="status">
                    {status.map((msg, idx) => (
                        <p key={idx}>{msg}</p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StreamingSession;