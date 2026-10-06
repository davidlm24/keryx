import React, { useState, useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Upload, ImageIcon, Globe, Trash, AlertTriangle, Loader2 } from "lucide-react";
import QRCode from "react-qr-code";
import { createPageUrl } from "@/utils";
import ThemeEditorSection from "@/components/settings/ThemeEditorSection";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
    const { user: authUser } = useAuth();
    const [language, setLanguage] = useState("pt");
    const [backgroundUrl, setBackgroundUrl] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [primaryColor, setPrimaryColor] = useState("#7d8470");
    const [secondaryColor, setSecondaryColor] = useState("#c9a86a");
    const [navbarPrimaryColor, setNavbarPrimaryColor] = useState("#7d8470");
    const [navbarSecondaryColor, setNavbarSecondaryColor] = useState("#c9a86a");
    const [submenuPrimaryColor, setSubmenuPrimaryColor] = useState("#7d8470");
    const [submenuSecondaryColor, setSubmenuSecondaryColor] = useState("#c9a86a");
    const [deviceMode, setDeviceMode] = useState("desktop");
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingBg, setIsUploadingBg] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [pendingBgUrl, setPendingBgUrl] = useState("");
    const [pendingLogoUrl, setPendingLogoUrl] = useState("");
    const [showQRCode, setShowQRCode] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const handleDeleteAccount = async () => {
        setIsDeletingAccount(true);
        try {
            if (authUser?.id) {
                try {
                    await keryx.entities.User.delete(authUser.id);
                } catch (e) {
                    console.error("Erro ao excluir conta no servidor:", e);
                }
            }
            localStorage.removeItem("gerar_projection_settings");
            await keryx.auth.logout("/login");
        } catch (e) {
            console.error("Erro ao sair:", e);
            window.location.href = "/login";
        } finally {
            setIsDeletingAccount(false);
        }
    };

    useEffect(() => {
        loadUserSettings();
    }, [authUser]);

    const SETTINGS_KEY = "gerar_projection_settings";

    const loadUserSettings = () => {
        // First try from authenticated user
        const currentUser = authUser;
        if (currentUser) {
            setLanguage(currentUser.language || "pt");
            setBackgroundUrl(currentUser.background_url || "");
            setLogoUrl(currentUser.logo_url || "");
            setPrimaryColor(currentUser.primary_color || "#7d8470");
            setSecondaryColor(currentUser.secondary_color || "#c9a86a");
            setNavbarPrimaryColor(currentUser.navbar_primary_color || "#7d8470");
            setNavbarSecondaryColor(currentUser.navbar_secondary_color || "#c9a86a");
            setSubmenuPrimaryColor(currentUser.submenu_primary_color || currentUser.navbar_primary_color || "#7d8470");
            setSubmenuSecondaryColor(currentUser.submenu_secondary_color || currentUser.navbar_secondary_color || "#c9a86a");
            setDeviceMode(currentUser.device_mode || "desktop");
            return;
        }
        // Fallback: load from localStorage
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                setLanguage(data.language || "pt");
                setBackgroundUrl(data.background_url || "");
                setLogoUrl(data.logo_url || "");
                setPrimaryColor(data.primary_color || "#7d8470");
                setSecondaryColor(data.secondary_color || "#c9a86a");
                setNavbarPrimaryColor(data.navbar_primary_color || "#7d8470");
                setNavbarSecondaryColor(data.navbar_secondary_color || "#c9a86a");
                setSubmenuPrimaryColor(data.submenu_primary_color || data.navbar_primary_color || "#7d8470");
                setSubmenuSecondaryColor(data.submenu_secondary_color || data.navbar_secondary_color || "#c9a86a");
                setDeviceMode(data.device_mode || "desktop");
            }
        } catch (e) {
            console.error("Erro ao carregar do localStorage:", e);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const updateData = {
            language: language || "pt",
            primary_color: primaryColor || "#7d8470",
            secondary_color: secondaryColor || "#c9a86a",
            navbar_primary_color: navbarPrimaryColor || "#7d8470",
            navbar_secondary_color: navbarSecondaryColor || "#c9a86a",
            device_mode: deviceMode || "desktop",
            background_url: backgroundUrl?.trim() || "",
            logo_url: logoUrl?.trim() || "",
        };

        // Só salva cores de submenu personalizadas se diferirem das cores da barra
        if ((submenuPrimaryColor || "#7d8470") !== (navbarPrimaryColor || "#7d8470")) {
            updateData.submenu_primary_color = submenuPrimaryColor || "#7d8470";
        } else {
            updateData.submenu_primary_color = "";
        }
        if ((submenuSecondaryColor || "#c9a86a") !== (navbarSecondaryColor || "#c9a86a")) {
            updateData.submenu_secondary_color = submenuSecondaryColor || "#c9a86a";
        } else {
            updateData.submenu_secondary_color = "";
        }

        // Always save to localStorage (works without login)
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(updateData));
        } catch (e) {
            console.error("Erro ao salvar no localStorage:", e);
        }

        // If authenticated, also save to server
        if (authUser?.id) {
            try {
                await keryx.entities.User.update(authUser.id, updateData);
            } catch (error) {
                console.error("Erro ao salvar no servidor (usando localStorage):", error);
            }
        }

        setIsSaving(false);
        alert("✓ Configurações salvas com sucesso!");
        window.location.reload();
    };

    const handleBgUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingBg(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            setPendingBgUrl(file_url);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload da imagem");
        } finally {
            setIsUploadingBg(false);
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingLogo(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            setPendingLogoUrl(file_url);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload do logo");
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const confirmBgUpload = () => {
        setBackgroundUrl(pendingBgUrl);
        setPendingBgUrl("");
    };

    const confirmLogoUpload = () => {
        setLogoUrl(pendingLogoUrl);
        setPendingLogoUrl("");
    };

    const isMobile = deviceMode === "mobile";
    const isTablet = deviceMode === "tablet";

    return (
        <div className="min-h-screen p-3 sm:p-4 md:p-6">
            <div className={`mx-auto ${isMobile ? 'max-w-full' : isTablet ? 'max-w-3xl' : 'max-w-4xl'}`}>
                <div className={`flex items-center gap-3 mb-6 ${isMobile ? 'flex-col text-center' : ''}`}>
                    <SettingsIcon className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-lime-400`} />
                    <h1 className={`${isMobile ? 'text-2xl' : isTablet ? 'text-3xl' : 'text-4xl'} font-bold bg-gradient-to-r from-lime-300 to-emerald-300 bg-clip-text text-transparent`}>
                        Configurações
                    </h1>
                </div>

                <div className={`space-y-4 ${isMobile ? 'space-y-3' : isTablet ? 'space-y-4' : 'space-y-6'}`}>
                    <Card className="bg-card border-border">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                <Globe className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                                Idioma
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={isMobile ? 'p-4 pt-0' : ''}>
                            <Select value={language} onValueChange={setLanguage}>
                                <SelectTrigger className="bg-white/10 border-border text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pt">Português</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="es">Español</SelectItem>
                                    <SelectItem value="fr">Français</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border-emerald-500/30">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-emerald-100 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                <ImageIcon className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                                Fundo da Aplicação
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <Input
                                type="text"
                                placeholder="Cole a URL da imagem de fundo aqui"
                                value={backgroundUrl}
                                onChange={(e) => setBackgroundUrl(e.target.value)}
                                className="bg-white/10 border-emerald-500/30 text-white placeholder:text-gray-400"
                            />
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={handleBgUpload}
                                disabled={isUploadingBg}
                                className="bg-white/10 border-emerald-500/30 text-white file:bg-emerald-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                            {pendingBgUrl && (
                                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                                    <img src={pendingBgUrl} alt="Preview" className="w-32 h-32 object-cover rounded" />
                                    <div className="flex-1">
                                        <p className="text-sm text-emerald-300 mb-2">✓ Upload concluído - Confirmar?</p>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={confirmBgUpload}
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                            >
                                                ✓ OK
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPendingBgUrl("")}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {backgroundUrl && !pendingBgUrl && (
                                <div className="flex items-center gap-3">
                                    <img src={backgroundUrl} alt="Fundo" className="w-32 h-32 object-cover rounded" />
                                    <div className="flex-1">
                                        <p className="text-sm text-green-300">✓ Fundo ativo</p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setBackgroundUrl("")}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            Remover
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 border-amber-500/30">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-amber-100 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                <Upload className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                                Logo da Aplicação
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <Input
                                type="text"
                                placeholder="Cole a URL do logo aqui"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                className="bg-white/10 border-amber-500/30 text-white placeholder:text-gray-400"
                            />
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                disabled={isUploadingLogo}
                                className="bg-white/10 border-amber-500/30 text-white file:bg-amber-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                            {pendingLogoUrl && (
                                <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                                    <img src={pendingLogoUrl} alt="Preview" className="w-24 h-24 object-cover rounded-full" />
                                    <div className="flex-1">
                                        <p className="text-sm text-amber-300 mb-2">✓ Upload concluído - Confirmar?</p>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={confirmLogoUpload}
                                                size="sm"
                                                className="bg-amber-600 hover:bg-amber-700"
                                            >
                                                ✓ OK
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPendingLogoUrl("")}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {logoUrl && !pendingLogoUrl && (
                                <div className="flex items-center gap-3">
                                    <img src={logoUrl} alt="Logo" className="w-24 h-24 object-cover rounded-full" />
                                    <div className="flex-1">
                                        <p className="text-sm text-green-300">✓ Logo ativo</p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setLogoUrl("")}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            Remover
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 border-blue-500/30">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-blue-100 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                🎨 Cores da Aplicação Geral
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-blue-300 mb-2 block`}>Cor Primária</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#84cc16", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#06b6d4", "#14b8a6", "#c9a86a", "#f97316", "#22c55e"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setPrimaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: primaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={primaryColor}
                                        onChange={(e) => setPrimaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={primaryColor}
                                        onChange={(e) => setPrimaryColor(e.target.value)}
                                        placeholder="#7d8470"
                                        className="bg-white/10 border-blue-500/30 text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-blue-300 mb-2 block`}>Cor Secundária</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#10b981", "#84cc16", "#06b6d4", "#3b82f6", "#c9a86a", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#22c55e", "#ef4444", "#f97316"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setSecondaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: secondaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={secondaryColor}
                                        onChange={(e) => setSecondaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={secondaryColor}
                                        onChange={(e) => setSecondaryColor(e.target.value)}
                                        placeholder="#c9a86a"
                                        className="bg-white/10 border-blue-500/30 text-white"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                🎨 Cores da Barra de Navegação
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2 block`}>Cor Primária da Barra</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#84cc16", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#06b6d4", "#14b8a6", "#c9a86a", "#f97316", "#22c55e"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setNavbarPrimaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: navbarPrimaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={navbarPrimaryColor}
                                        onChange={(e) => setNavbarPrimaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={navbarPrimaryColor}
                                        onChange={(e) => setNavbarPrimaryColor(e.target.value)}
                                        placeholder="#7d8470"
                                        className="bg-white/10 border-border text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2 block`}>Cor Secundária da Barra</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#10b981", "#84cc16", "#06b6d4", "#3b82f6", "#c9a86a", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#22c55e", "#ef4444", "#f97316"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setNavbarSecondaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: navbarSecondaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={navbarSecondaryColor}
                                        onChange={(e) => setNavbarSecondaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={navbarSecondaryColor}
                                        onChange={(e) => setNavbarSecondaryColor(e.target.value)}
                                        placeholder="#c9a86a"
                                        className="bg-white/10 border-border text-white"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                🎨 Cores dos Submenus
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Cores aplicadas ao menu que abre ao clicar no botão de menu. Se forem iguais às cores da barra, o submenu segue automaticamente as cores da barra.</p>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2 block`}>Cor Primária do Submenu</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#84cc16", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#06b6d4", "#14b8a6", "#c9a86a", "#f97316", "#22c55e"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setSubmenuPrimaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: submenuPrimaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={submenuPrimaryColor}
                                        onChange={(e) => setSubmenuPrimaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={submenuPrimaryColor}
                                        onChange={(e) => setSubmenuPrimaryColor(e.target.value)}
                                        placeholder="#7d8470"
                                        className="bg-white/10 border-border text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2 block`}>Cor Secundária do Submenu</label>
                                <div className={`grid ${isMobile ? 'grid-cols-5' : 'grid-cols-7'} gap-2 mb-3`}>
                                    {["#000000", "#ffffff", "#10b981", "#84cc16", "#06b6d4", "#3b82f6", "#c9a86a", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#22c55e", "#ef4444", "#f97316"].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setSubmenuSecondaryColor(color)}
                                            className="w-full h-10 rounded border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: color,
                                                borderColor: submenuSecondaryColor === color ? '#ffffff' : 'transparent'
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-3 items-center">
                                    <Input
                                        type="color"
                                        value={submenuSecondaryColor}
                                        onChange={(e) => setSubmenuSecondaryColor(e.target.value)}
                                        className="w-20 h-12 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={submenuSecondaryColor}
                                        onChange={(e) => setSubmenuSecondaryColor(e.target.value)}
                                        placeholder="#c9a86a"
                                        className="bg-white/10 border-border text-white"
                                    />
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setSubmenuPrimaryColor(navbarPrimaryColor); setSubmenuSecondaryColor(navbarSecondaryColor); }}
                                className="border-border text-foreground hover:bg-white/10"
                            >
                                ↺ Usar cores da barra de navegação
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-green-900/20 to-teal-900/20 border-green-500/30">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-green-100 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                📱 Modo de Dispositivo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-300`}>Escolha o layout otimizado para o seu dispositivo</p>
                            <div className={`grid grid-cols-3 gap-2 ${isMobile ? 'gap-2' : 'gap-3'}`}>
                                <button
                                    onClick={() => setDeviceMode("mobile")}
                                    className={`${isMobile ? 'p-2' : 'p-4'} rounded-lg border-2 transition-all ${
                                        deviceMode === "mobile"
                                            ? "border-green-500 bg-green-500/20"
                                            : "border-green-500/30 bg-white/5 hover:bg-white/10"
                                    }`}
                                >
                                    <div className={`${isMobile ? 'text-2xl mb-1' : 'text-3xl mb-2'}`}>📱</div>
                                    <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-200 font-semibold`}>Celular</div>
                                </button>
                                <button
                                    onClick={() => setDeviceMode("tablet")}
                                    className={`${isMobile ? 'p-2' : 'p-4'} rounded-lg border-2 transition-all ${
                                        deviceMode === "tablet"
                                            ? "border-green-500 bg-green-500/20"
                                            : "border-green-500/30 bg-white/5 hover:bg-white/10"
                                    }`}
                                >
                                    <div className={`${isMobile ? 'text-2xl mb-1' : 'text-3xl mb-2'}`}>💻</div>
                                    <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-200 font-semibold`}>Tablet</div>
                                </button>
                                <button
                                    onClick={() => setDeviceMode("desktop")}
                                    className={`${isMobile ? 'p-2' : 'p-4'} rounded-lg border-2 transition-all ${
                                        deviceMode === "desktop"
                                            ? "border-green-500 bg-green-500/20"
                                            : "border-green-500/30 bg-white/5 hover:bg-white/10"
                                    }`}
                                >
                                    <div className={`${isMobile ? 'text-2xl mb-1' : 'text-3xl mb-2'}`}>🖥️</div>
                                    <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-200 font-semibold`}>Computador</div>
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                                🎥 Dispositivo de Vídeo Remoto
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={`space-y-4 ${isMobile ? 'p-4 pt-0' : ''}`}>
                            <p className={`text-foreground ${isMobile ? 'text-sm' : 'text-base'}`}>
                                Conecte um tablet, celular ou iPad para exibir vídeos MP4 separadamente enquanto a letra fica no projetor.
                            </p>
                            
                            <div className="p-6 bg-primary/5 border border-border rounded-lg">
                                <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'md:grid-cols-2 gap-6'}`}>
                                    <div>
                                        <h3 className={`font-semibold text-foreground mb-4 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                            📱 Como Conectar:
                                        </h3>
                                        <ol className={`space-y-3 text-muted-foreground list-decimal list-inside ${isMobile ? 'text-sm' : ''}`}>
                                            <li className="pl-2">
                                                <strong className="text-foreground">Abra a câmera</strong> do seu dispositivo
                                            </li>
                                            <li className="pl-2">
                                                <strong className="text-foreground">Aponte para o QR code</strong>
                                            </li>
                                            <li className="pl-2">
                                                <strong className="text-foreground">Toque no link</strong> que aparecer
                                            </li>
                                            <li className="pl-2">
                                                <strong className="text-foreground">Pronto!</strong> Dispositivo conectado
                                            </li>
                                        </ol>
                                        <div className={`mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                            <p className="text-green-300 flex items-center gap-2">
                                                <span className="text-2xl">✓</span>
                                                <span>Ao reproduzir uma música com vídeo MP4, ele será automaticamente enviado para o dispositivo!</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="p-6 bg-white rounded-lg shadow-2xl">
                                            <QRCode
                                                value={window.location.origin + createPageUrl("VideoProjection")}
                                                size={isMobile ? 200 : 256}
                                                level="H"
                                            />
                                        </div>
                                        <p className={`mt-4 text-center text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                            Mantenha o dispositivo sempre aberto
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className={`p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                <h4 className={`font-semibold text-blue-200 mb-2 ${isMobile ? 'text-sm' : 'text-base'}`}>💡 Dica:</h4>
                                <p className="text-blue-300">
                                    Pode conectar vários dispositivos ao mesmo tempo. Todos receberão o vídeo simultaneamente.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <ThemeEditorSection isMobile={isMobile} />

                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`w-full bg-gradient-to-r from-lime-600 to-emerald-600 hover:from-lime-700 hover:to-emerald-700 ${isMobile ? 'py-4 text-base' : 'py-6 text-lg'}`}
                    >
                        {isSaving ? "Salvando..." : "Salvar Configurações"}
                    </Button>

                    <Card className="bg-gradient-to-br from-red-900/20 to-rose-900/20 border-red-500/30">
                        <CardHeader className={isMobile ? 'p-4' : ''}>
                            <CardTitle className={`text-red-100 flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                                <AlertTriangle className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                                Zona de Perigo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={isMobile ? 'p-4 pt-0' : ''}>
                            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-red-300 mb-4`}>
                                A exclusão da conta remove permanentemente seus dados e encerra a sessão. Esta ação não pode ser desfeita.
                            </p>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="destructive"
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={isDeletingAccount}
                                    >
                                        {isDeletingAccount ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Excluindo...
                                            </>
                                        ) : (
                                            <>
                                                <Trash className="w-4 h-4 mr-2" />
                                                Excluir Conta
                                            </>
                                        )}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tem certeza absoluta? Todos os seus dados serão removidos permanentemente e não poderão ser recuperados. Você será redirecionado para o login.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleDeleteAccount}
                                            className="bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            Sim, excluir
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}