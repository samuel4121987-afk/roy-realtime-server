
import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Backoffice from "../pages/backoffice/page";
import AdminSetup from "../pages/admin-setup/page";
import GetStarted from "../pages/get-started/page";
import Pricing from "../pages/pricing/page";
import AboutUs from "../pages/about/page";
import Login from "../pages/login/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/pricing",
    element: <Pricing />,
  },
  {
    path: "/get-started",
    element: <GetStarted />,
  },
  {
    path: "/about",
    element: <AboutUs />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/backoffice",
    element: <Backoffice />,
  },
  {
    path: "/admin-setup",
    element: <AdminSetup />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
