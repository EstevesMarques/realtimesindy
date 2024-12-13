import { ConsolePage } from './pages/ConsolePage';
import './App.scss';
import StreamingSession from './pages/StreamingSession';
import { Main } from './pages/Main';

let heygenkey = process.env.HEYGEN_API_KEY;


function App() {
  return (
    <div data-component="App">
      {/* <ConsolePage /> */}
      {/* <StreamingSession apiKey='NGIwOWFhYTViZDI5NGI0YTliMmE0ZGQyYWRkN2I5NGQtMTczMzc0OTUyMA==' serverUrl='https://api.heygen.com' /> */}
      <Main/>
    </div>
  );
}

export default App;
