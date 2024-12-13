import { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { instructions } from '../utils/conversation_config.js';

import { Mic, MicOff, Phone, PhoneCall, PhoneOff, X, Zap } from 'react-feather';
import { Button } from '../components/button/Button';

import { useHeygen } from '../utils/heygen';

import './Main.scss';

interface RealtimeEvent {
    time: string;
    source: 'client' | 'server';
    count?: number;
    event: { [key: string]: any };
}

const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY || '';
const serverUrl = process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

const heygeURL = process.env.REACT_APP_HEYGEN_URL || '';
const heygeAPIKey = process.env.REACT_APP_HEYGEN_API_KEY || '';

export function Main() {

    /**
     * Inicializando o Heygen:
     * - Conecta ao streaming e recebe um video element
     */

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const { heygenStart, heygenEnd, heygenSendText, mediaElementRef } = useHeygen(heygeAPIKey, heygeURL);

    // Conecta o elemento de vídeo ao mediaElementRef
    useEffect(() => {
        if (videoRef.current) {
            mediaElementRef.current = videoRef.current;
        }
    }, [mediaElementRef]);

    /**
     * Instantiate:
     * - WavRecorder (speech input)
     * - RealtimeClient (API client)
     */
    const wavRecorderRef = useRef<WavRecorder>(
        new WavRecorder({ sampleRate: 24000 })
    );

    const clientRef = useRef(
        new RealtimeClient(
            serverUrl
                ? { url: serverUrl }
                : { apiKey: openaiApiKey, dangerouslyAllowAPIKeyInBrowser: true }
        )
    );

    /**
     * All of our variables for displaying application state
     * - items are all conversation items (dialog)
     * - realtimeEvents are event logs, which can be expanded
     */
    const [items, setItems] = useState<ItemType[]>([]);
    const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
    const [expandedEvents, setExpandedEvents] = useState<{ [key: string]: boolean; }>({});
    const [isConnected, setIsConnected] = useState(false);
    const [canPushToTalk, setCanPushToTalk] = useState(true);
    const [isRecording, setIsRecording] = useState(false);

    /**
     * Connect to conversation:
     * WavRecorder taks speech input, WavStreamPlayer output, client is API client
     */
    const connectConversation = useCallback(async () => {
        console.log('Conectando a OpenAI realtime API...');

        const client = clientRef.current;
        const wavRecorder = wavRecorderRef.current;

        // Set state variables
        setIsConnected(true);
        setRealtimeEvents([]);
        setItems(client.conversation.getItems());

        // Connect to microphone
        await wavRecorder.begin();

        // Inicia conexão com o heygen
        await heygenStart();

        // Connect to realtime API
        await client.connect();
        client.sendUserMessageContent([
            {
                type: `input_text`,
                text: `Olá!`,
            },
        ]);

        if (client.getTurnDetectionType() === 'server_vad') {
            await wavRecorder.record((data) => client.appendInputAudio(data.mono));
        }
    }, []);

    /**
     * Disconnect and reset conversation state
     */
    const disconnectConversation = useCallback(async () => {
        console.log('Desconectando a OpenAI realtime API...');

        setIsConnected(false);
        setRealtimeEvents([]);
        setItems([]);

        // Encerra conexão com o heygen
        await heygenEnd();
        setIsVideoLoaded(false);

        const client = clientRef.current;
        client.disconnect();

        const wavRecorder = wavRecorderRef.current;
        await wavRecorder.end();

    }, []);

    /**
     * In push-to-talk mode, start recording
     * .appendInputAudio() for each sample
     */
    const startRecording = async () => {
        setIsRecording(true);
        const client = clientRef.current;
        const wavRecorder = wavRecorderRef.current;
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    };

    /**
     * In push-to-talk mode, stop recording
     */
    const stopRecording = async () => {
        setIsRecording(false);
        const client = clientRef.current;
        const wavRecorder = wavRecorderRef.current;
        await wavRecorder.pause();
        client.createResponse();
    };

    /**
     * Switch between Manual <> VAD mode for communication
     */
    const changeTurnEndType = async (value: string) => {
        const client = clientRef.current;
        const wavRecorder = wavRecorderRef.current;
        if (value === 'none' && wavRecorder.getStatus() === 'recording') {
            await wavRecorder.pause();
        }
        client.updateSession({
            turn_detection: value === 'none' ? null : { type: 'server_vad' },
        });
        if (value === 'server_vad' && client.isConnected()) {
            await wavRecorder.record((data) => client.appendInputAudio(data.mono));
        }
        setCanPushToTalk(value === 'none');
    };


    /**
     * Core RealtimeClient and audio capture setup
     * Set all of our instructions, tools, events and more
     */
    useEffect(() => {
        // Get refs
        const client = clientRef.current;

        // Set instructions
        client.updateSession({ instructions: instructions });
        // Set transcription, otherwise we don't get user transcriptions back
        client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

        /**
        * Add tools
        * Tools used by OpenAI function calling
        */
        // Generate Token - Envia um token pelo whatsapp
        client.addTool(
            {
                "name": "generate_token",
                "description": "Gera um token de 6 dígitos",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "token": {
                            "type": "string",
                            "description": "Token gerado"
                        },
                        "phone": {
                            "type": "string",
                            "description": "Telefone informado pelo usuário"
                        }
                    },
                    "additionalProperties": false,
                    "required": [
                        "token",
                        "phone"
                    ]
                }
            },
            async ({ phone, token }: { [key: string]: any }) => {
                const url = 'https://api.z-api.io/instances/3CEEA0A6BCD2D0E49FB9D6E96DCD545E/token/ECF5B6F24C278CF3BFB55D3C/send-button-otp';

                const headers = {
                    accept: '*/*',
                    'client-token': 'F141ea19bb9ca40c981694b3c825d73f6S',
                    'Content-Type': 'application/json',
                };

                const body = JSON.stringify({
                    phone,
                    message: `Seu código de verificação para se autenticar na Sindy é ${token}. Não compartilhe-o com ninguém.`,
                    code: token,
                });

                const result = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                });

                if (!result.ok) {
                    throw new Error(`Erro ao enviar OTP: ${result.status} ${result.statusText}`);
                }

                const json = await result.json();
                console.log('OTP enviado com sucesso:', json);

                return "";
            });

        // GetUserData - Busca os dados na Superlógica
        client.addTool({
            "name": "get_user_data",
            "description": "Busca os dados do usuário",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "A resposta da pergunta inicial"
                    }
                },
                "additionalProperties": false,
                "required": [
                    "phone"
                ]
            }
        },
            async ({ phone }: { [key: string]: any }) => {
                const telformatado = formatPhoneNumber(phone);
                const url = `https://api.superlogica.net/v2/condor/unidades/index?` +
                    `idCondominio=-1&` +
                    `exibirGruposDasUnidades=0&` +
                    `itensPorPagina=50&` +
                    `pagina=1&` +
                    `exibirDadosDosContatos=1&` +
                    `pesquisa=${telformatado}`;


                const headers = {
                    'app_token': '6e5ac688-a65e-4f4f-a974-f532a12959dd',
                    'access_token': 'e591a511-83c8-43eb-a7d2-71933d7fb6fd'
                };

                const result = await fetch(url, {
                    method: 'GET',
                    headers,
                });

                if (!result.ok) {
                    throw new Error(`Erro na requisição: ${result.status} ${result.statusText}`);
                }

                const json = await result.json();
                console.log('Dados recebidos:', json);

                let arrconds: any[] = [];
                for (let item of json) {
                    let cond = {
                        nome_condominio: item.st_fantasia_cond,
                        cpf_proprietario: item.cpf_proprietario,
                        email_proprietario: item.email_proprietario,
                        unidade_apartamento: item.st_unidade_uni,
                        id_unidade: item.id_unidade_uni,
                        id_condominio: item.id_condominio_cond,
                        telefone: telformatado,
                    };
                    arrconds.push(cond);
                }

                return {
                    data: arrconds,
                };
            });

        // GetPaymentLink - Pega a 2a via de boletos na Superlógica
        client.addTool({
            "name": "get_payment_link",
            "description": "Busca os dados para solicitação de 2a via de boleto",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Telefone informado pelo usuário"
                    },
                    "id_condominio": {
                        "type": "string",
                        "description": "Campo id_condominio que retornou do get_user_data"
                    },
                    "id_unidade": {
                        "type": "string",
                        "description": "Campo id_unidade que retornou do get_user_data"
                    }
                },
                "additionalProperties": false,
                "required": [
                    "phone",
                    "id_condominio",
                    "id_unidade"
                ]
            }
        },
            async ({ phone, id_condominio, id_unidade }: { [key: string]: any }) => {
                const telformatado = formatPhoneNumber(phone);
                const dtInicio = new Date(new Date().getFullYear(), new Date().getMonth() - 2, 5).toLocaleDateString('en-US');
                const dtFim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5).toLocaleDateString('en-US');
                const url = `https://api.superlogica.net/v2/condor/cobranca/index?` +
                    `status=validos&` +
                    `apenasColunasPrincipais=1&` +
                    `exibirPgtoComDiferenca=1&` +
                    `comContatosDaUnidade=1&` +
                    `idCondominio=${id_condominio}&` +
                    `dtInicio=${dtInicio}&` +
                    `dtFim=${dtFim}&` +
                    `UNIDADES[0]=${id_unidade}`;

                const headers = {
                    'app_token': '6e5ac688-a65e-4f4f-a974-f532a12959dd',
                    'access_token': 'e591a511-83c8-43eb-a7d2-71933d7fb6fd'
                };

                const result = await fetch(url, {
                    method: 'GET',
                    headers,
                });

                if (!result.ok) {
                    throw new Error(`Erro na requisição: ${result.status} ${result.statusText}`);
                }

                const json = await result.json();
                console.log('Dados recebidos:', json);

                let arrCobrancas: { [key: string]: any }[] = [];

                for (let item of json) {
                    if (item.json.status !== undefined) {
                        let cobranca: { [key: string]: any } = {};

                        cobranca.data_boleto = item.json.dt_geracao_recb.replace(/\s\d{2}:\d{2}:\d{2}/, '').replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$2/$1/$3');
                        cobranca.vencimento = item.json.dt_vencimento_recb.replace(/\s\d{2}:\d{2}:\d{2}/, '').replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$2/$1/$3');
                        cobranca.valor = item.json.vl_emitido_recb;

                        if (item.json.nm_txjuros_cond !== "") {
                            cobranca.juros = item.json.nm_txjuros_cond;
                        }

                        if (item.json.nm_txmulta_cond !== "") {
                            cobranca.multa = item.json.nm_txmulta_cond;
                        }

                        if (item.json.fl_status_recb !== "") {
                            cobranca.status = item.json.fl_status_recb === "3" ? "Pago" : "Pendente";
                        }

                        cobranca.total = item.json.vl_total_recb;
                        cobranca.pix = item.json.st_pixqrcode_recb;
                        cobranca.link = item.json.link_segundavia;

                        arrCobrancas.push(cobranca);
                    }
                }

                return {
                    data: arrCobrancas,
                };
            });

        // GetContacts - Lista os contatos da unidade na Superlógica
        client.addTool({
            "name": "get_contacts",
            "description": "Busca os contatos cadastrados para a unidade do condomínio",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Telefone informado pelo usuário"
                    },
                    "id_condominio": {
                        "type": "string",
                        "description": "Campo id_condominio que retornou do get_user_data"
                    }
                },
                "additionalProperties": false,
                "required": [
                    "phone",
                    "id_condominio"
                ]
            }
        },
            async ({ phone, id_condominio }: { [key: string]: any }) => {
                const telformatado = formatPhoneNumber(phone);
                const url = `https://api.superlogica.net/v2/condor/unidades/index?` +
                    `idCondominio=${id_condominio}&` +
                    `exibirGruposDasUnidades=0&` +
                    `itensPorPagina=50&` +
                    `pagina=1&` +
                    `exibirDadosDosContatos=1&` +
                    `pesquisa=${telformatado}`;


                const headers = {
                    'app_token': '6e5ac688-a65e-4f4f-a974-f532a12959dd',
                    'access_token': 'e591a511-83c8-43eb-a7d2-71933d7fb6fd'
                };

                const result = await fetch(url, {
                    method: 'GET',
                    headers,
                });

                if (!result.ok) {
                    throw new Error(`Erro na requisição: ${result.status} ${result.statusText}`);
                }

                const json = await result.json();
                console.log('Dados recebidos:', json);

                let arrContatos: { [key: string]: any }[] = [];

                for (const item of json.contatos) {
                    let contato: { [key: string]: any } = {};
                    contato.nome = item.st_nome_con;
                    contato.tipo = item.st_nometiporesp_tres;
                    contato.telefone = item.st_telefone_con ? item.st_telefone_con : item.st_fax_con ? item.st_fax_con : "";
                    contato.cpf = item.st_cpf_con;
                    arrContatos.push(contato);
                }

                return {
                    data: arrContatos,
                };
            });

        // GetLLMBuilder - Chama a LLM e passa a pergunta do usuário
        client.addTool({
            "name": "get_llmbuilder",
            "description": "Esta função invoca uma api externa",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Telefone informado pelo usuário ou retornado da get_user_data"
                    },
                    "condomino": {
                        "type": "string",
                        "description": "Nome do condomínio retornado da get_user_data"
                    }
                },
                "additionalProperties": false,
                "required": [
                    "phone",
                    "condomino"
                ]
            }
        },
            async () => {
                return ""
            });

        // RequestAssistance - Set fluxo no baserow para tranbordo de atendimento
        client.addTool({
            "name": "requestAssistance",
            "description": "Esta função solicita atendimento e não retornará nenhum dado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Telefone informado pelo usuário ou retornado da get_user_data"
                    }
                },
                "additionalProperties": false,
                "required": [
                    "phone"
                ]
            }
        },
            async () => {
                return ""
            });

        /**
        * ******************************************************************************
        */

        // handle realtime events from client + server for event logging
        client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
            if (realtimeEvent?.event.type == 'response.done') {
                if (realtimeEvent?.event.response?.status == 'failed') {
                    console.error(realtimeEvent?.event.response?.status_details?.error.message);
                }
            }

            setRealtimeEvents((realtimeEvents) => {
                const lastEvent = realtimeEvents[realtimeEvents.length - 1];
                if (lastEvent?.event.type === realtimeEvent.event.type) {
                    // if we receive multiple events in a row, aggregate them for display purposes
                    lastEvent.count = (lastEvent.count || 0) + 1;
                    return realtimeEvents.slice(0, -1).concat(lastEvent);
                } else {
                    return realtimeEvents.concat(realtimeEvent);
                }
            });
        });
        client.on('error', (event: any) => {
            console.error(event)
        });
        client.on('conversation.interrupted', async () => {
            console.log('Mensagem interrompida...');
            // const trackSampleOffset = await wavStreamPlayer.interrupt();
            // if (trackSampleOffset?.trackId) {
            //     const { trackId, offset } = trackSampleOffset;
            //     await client.cancelResponse(trackId, offset);
            // }
        });
        client.on('conversation.updated', async ({ item, delta }: any) => {
            //console.log('Mensagem atualizada...');
            const items = client.conversation.getItems();

            if (item.status === 'completed' && item.formatted.audio?.length) {
                const wavFile = await WavRecorder.decode(
                    item.formatted.audio,
                    24000,
                    24000
                );
                item.formatted.file = wavFile;
                console.log(item.formatted?.transcript);
            }
            setItems(items);

            // Mostra as mensagens em modo streaming como se estivesse digitando
            //console.log(items.at(-1)?.formatted?.transcript);
        });

        client.on('conversation.item.completed', async ({ item }: any) => {
            console.log(item.formatted?.transcript);

            // Envia o texto para o heygen
            await heygenSendText(item.formatted?.transcript)
        });
        setItems(client.conversation.getItems());

        return () => {
            // cleanup; resets to defaults
            client.reset();
        };
    }, []);

    function formatPhoneNumber(phone: string): string {
        const regex = /(?:\+?55)?(\d{9})$/;
        const match = phone.replace(regex, '$1');  // Substitui pelo grupo de captura (os últimos 9 dígitos)
        return match;
    }

    return (
        <div className="video-call-container">
            {/* Área de vídeo */}
            <div className="video-area">
                {/* <div className="user-video">Você</div> */}
                <div className="logo-container">
                    <img src='/logo144.png' alt="Logo" className="logo-image" />
                    <span className="logo-text">Sindy</span>
                </div>
                <div className="remote-video">
                    {!isConnected && (<span className='disconected-text'>✨ Para iniciar sua chamada, clique em iniciar...</span>)}
                    {isConnected && !isVideoLoaded && (
                        <img src="/connecting.gif" alt="Carregando chamada..." className="loading-gif" />
                    )}
                    <video ref={videoRef} autoPlay onLoadedData={() => setIsVideoLoaded(true)} />
                </div>
            </div>
            <span className='living'>Desenvolvido por Living Consultoria</span>
            {/* Botões de ação */}
            <div className="action-buttons">
                <Button
                    label={isConnected ? '' : ''}
                    icon={isConnected ? PhoneOff : PhoneCall}
                    iconOnly={true}
                    buttonStyle={isConnected ? 'alert' : 'green'}
                    onClick={
                        isConnected ? disconnectConversation : connectConversation
                    }
                />
                {/* <div className="spacer" /> */}
                {isConnected && canPushToTalk && isVideoLoaded && (
                    <Button
                        label={isRecording ? 'solte para enviar' : 'segure para falar'}
                        iconPosition={isConnected ? 'end' : 'start'}
                        icon={isConnected ? Mic : MicOff}
                        buttonStyle={isRecording ? 'alert' : 'info'}
                        disabled={!isConnected || !canPushToTalk}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                    />
                )}
            </div>
        </div>
    );
}