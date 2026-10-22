import { useEffect, useState } from "react";
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes } from "react-router";
import { api } from "./lib/api";
import type { Data } from "./lib/types";
import { Assets } from "./pages/Assets";
import { Editor } from "./pages/Editor";

function Layout() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to the content
      </a>
      <header className="top">
        <div className="top-inner">
          <Link to="/" className="wordmark">
            Quote Desk
          </Link>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Quotation
            </NavLink>
            <NavLink to="/company">Company assets</NavLink>
          </nav>
          <a className="top-link" href="https://order-desk-ops.vercel.app">
            Order Desk
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="foot">A working demo with made-up companies, products and prices. Built by Uzair Khan.</footer>
    </>
  );
}

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.data().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  const wait = (
    <div className="page">
      <p className={error ? "form-error" : "quiet"}>{error ?? "Loading the catalogue."}</p>
    </div>
  );
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={data ? <Editor data={data} /> : wait} />
          <Route path="/company" element={data ? <Assets data={data} /> : wait} />
          <Route
            path="*"
            element={
              <div className="page">
                <h1>Nothing at this address</h1>
                <Link className="button" to="/">
                  Back to the quotation
                </Link>
              </div>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
