/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';

import { marked } from 'marked';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
    prompt('OpenAI API Key') ||
    '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
          apiKey: apiKey,
          dangerouslyAllowAPIKeyInBrowser: true,
        }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);
  const [userData, setuserData] = useState<{ [key: string]: any }>({});

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Olá!`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
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
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    // setMemoryKv({});
    // setCoords({
    //   lat: 37.775593,
    //   lng: -122.418137,
    // });
    // setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
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
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  function formatPhoneNumber(phone: string): string {
    const regex = /(?:\+?55)?(\d{9})$/;
    const match = phone.replace(regex, '$1');  // Substitui pelo grupo de captura (os últimos 9 dígitos)
    return match;
  }

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
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

        // Atualizar o estado userData com os dados formatados
        setuserData((prev) => ({
          ...prev,
          phone: arrconds,
        }));

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
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);


  const testJson = { "phone": [{ "nome_condominio": "4D imobi", "cpf_proprietario": "83919163753", "email_proprietario": "robert@livingnet.com.br", "unidade_apartamento": "005", "id_unidade": "452", "id_condominio": "3", "telefone": "21974894586" }] };



  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/living-logo.png" />
          <span>Living Consultoria - POC Realtime Sindy</span>
        </div>
        <div className="content-api-key">
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`api key: ${apiKey.slice(0, 3)}...`}
              onClick={() => resetAPIKey()}
            />
          )}
        </div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block conversation">
            <div className="content-block-title">Histórico da conversa</div>
            <div className="content-block-body" data-conversation-content>
              {!items.length && `Aguardando conexão...`}
              {items.map((conversationItem, i) => {
                return (
                  <div className="conversation-item" key={conversationItem.id}>
                    <div className={`speaker ${conversationItem.role || ''}`}>
                      <div>
                        {(
                          conversationItem.role || conversationItem.type
                        ).replaceAll('_', ' ')}
                      </div>
                      <div
                        className="close"
                        onClick={() =>
                          deleteConversationItem(conversationItem.id)
                        }
                      >
                        <X />
                      </div>
                    </div>
                    <div className={`speaker-content`}>
                      {/* tool response */}
                      {conversationItem.type === 'function_call_output' && (
                        <div>{conversationItem.formatted.output}</div>
                      )}
                      {/* tool call */}
                      {!!conversationItem.formatted.tool && (
                        <div>
                          {conversationItem.formatted.tool.name}(
                          {conversationItem.formatted.tool.arguments})
                        </div>
                      )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'user' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              (conversationItem.formatted.audio?.length
                                ? '(awaiting transcript)'
                                : conversationItem.formatted.text ||
                                '(item sent)')}
                          </div>
                        )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'assistant' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              conversationItem.formatted.text ||
                              '(truncated)'}
                          </div>
                        )}
                      {conversationItem.formatted.file && (
                        <audio
                          src={conversationItem.formatted.file.url}
                          controls
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="content-actions">
            <Toggle
              defaultValue={false}
              labels={['manual', 'automático']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            <div className="spacer" />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'solte para enviar' : 'segure para falar'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spacer" />
            <Button
              label={isConnected ? 'disconectar' : 'conectar'}
              iconPosition={isConnected ? 'end' : 'start'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={
                isConnected ? disconnectConversation : connectConversation
              }
            />
          </div>
          <div className="content-block events">
            <div className="visualization">
              <div className="visualization-entry client">
                <canvas ref={clientCanvasRef} />
              </div>
              <div className="visualization-entry server">
                <canvas ref={serverCanvasRef} />
              </div>
            </div>
            <div className="content-block-title">Eventos</div>
            <div className="content-block-body" ref={eventsScrollRef}>
              {!realtimeEvents.length && `Aguardando conexão...`}
              {realtimeEvents.map((realtimeEvent, i) => {
                const count = realtimeEvent.count;
                const event = { ...realtimeEvent.event };
                if (event.type === 'input_audio_buffer.append') {
                  event.audio = `[trimmed: ${event.audio.length} bytes]`;
                } else if (event.type === 'response.audio.delta') {
                  event.delta = `[trimmed: ${event.delta.length} bytes]`;
                }
                return (
                  <div className="event" key={event.event_id}>
                    <div className="event-timestamp">
                      {formatTime(realtimeEvent.time)}
                    </div>
                    <div className="event-details">
                      <div
                        className="event-summary"
                        onClick={() => {
                          // toggle event details
                          const id = event.event_id;
                          const expanded = { ...expandedEvents };
                          if (expanded[id]) {
                            delete expanded[id];
                          } else {
                            expanded[id] = true;
                          }
                          setExpandedEvents(expanded);
                        }}
                      >
                        <div
                          className={`event-source ${event.type === 'error'
                            ? 'error'
                            : realtimeEvent.source
                            }`}
                        >
                          {realtimeEvent.source === 'client' ? (
                            <ArrowUp />
                          ) : (
                            <ArrowDown />
                          )}
                          <span>
                            {event.type === 'error'
                              ? 'error!'
                              : realtimeEvent.source}
                          </span>
                        </div>
                        <div className="event-type">
                          {event.type}
                          {count && ` (${count})`}
                        </div>
                      </div>
                      {!!expandedEvents[event.event_id] && (
                        <div className="event-payload">
                          {JSON.stringify(event, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="content-right">
          <div className="content-block kv">
            <div className="content-block-title">🏠 Dados Cadastrais</div>
            <div
              className="content-block-body content-kv"
              dangerouslySetInnerHTML={{
                __html: marked.parse(JSON.stringify(userData)),
              } as React.HTMLProps<HTMLDivElement>["dangerouslySetInnerHTML"]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
