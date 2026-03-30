import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Conversations from './pages/Conversations';
import Outbound from './pages/Outbound';
import LinkedInQueue from './pages/LinkedInQueue';
import Analytics from './pages/Analytics';
import ABTests from './pages/ABTests';
import HandoffQueue from './pages/HandoffQueue';
import BuyerIntelligence from './pages/BuyerIntelligence';
import AutoMail from './pages/AutoMail';
import BuyerOutreach from './pages/BuyerOutreach';
import Health from './pages/Health';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/outbound" element={<Outbound />} />
          <Route path="/automail" element={<AutoMail />} />
          <Route path="/buyer-outreach" element={<BuyerOutreach />} />
          <Route path="/linkedin" element={<LinkedInQueue />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/ab-tests" element={<ABTests />} />
          <Route path="/handoff" element={<HandoffQueue />} />
          <Route path="/buyers" element={<BuyerIntelligence />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
