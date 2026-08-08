import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './monaco-setup';
import 'katex/dist/katex.min.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initRendererErrorLog } from './error-log';
import './styles.css';

initRendererErrorLog();
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
