import React, { Suspense, lazy } from "react";
import __Layout from "./Layout.jsx";
import PageFallback from "@/components/PageFallback";

const withSuspense = (LazyComp) => function LazyPage(props) {
    return React.createElement(
        Suspense,
        { fallback: React.createElement(PageFallback) },
        React.createElement(LazyComp, props)
    );
};

const Home = withSuspense(lazy(() => import("./pages/Home")));
const Bible = withSuspense(lazy(() => import("./pages/Bible")));
const Media = withSuspense(lazy(() => import("./pages/Media")));
const Projection = withSuspense(lazy(() => import("./pages/Projection")));
const Services = withSuspense(lazy(() => import("./pages/Services")));
const Settings = withSuspense(lazy(() => import("./pages/Settings")));
const Communication = withSuspense(lazy(() => import("./pages/Communication")));
const CommunicationProjection = withSuspense(lazy(() => import("./pages/CommunicationProjection")));
const VideoProjection = withSuspense(lazy(() => import("./pages/VideoProjection")));

export const PAGES = {
    "Home": Home,
    "Bible": Bible,
    "Media": Media,
    "Projection": Projection,
    "Services": Services,
    "Settings": Settings,
    "Communication": Communication,
    "CommunicationProjection": CommunicationProjection,
    "VideoProjection": VideoProjection,
};

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};