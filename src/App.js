// Family Kitchen v2.1 — 2026-07-05 03:35
import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
const SB_URL  = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
const H = { "Content-Type":"application/json", apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}` };

// ─── PUSH NOTIFICATIONS (Web Push via Supabase Edge Function) ───────────────
const VAPID_PUBLIC_KEY = "BMG55DgvK7kxEaB-NROSkJH6nVeSt8NiLqS7NB899WsLKPi8iymFIJu3KoMrEmYV5YBluo9YM6cbs5uCWTGRJ2I";

async function registerPush(memberId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:key });
    }
    const subStr = JSON.stringify(sub);
    // Delete existing subscription for this member then insert fresh (upsert pattern)
    await fetch(`${SB_URL}/rest/v1/push_subscriptions?member_id=eq.${memberId}`, {
      method:"DELETE", headers:{ ...H }
    }).catch(()=>{});
    await sbPost("push_subscriptions", [{ member_id:memberId, subscription:subStr }]).catch(()=>{});
    return sub;
  } catch(e) { console.warn("Push registration failed:", e.message); return null; }
}

async function sendPushNotification(familyId, title, body, excludeMemberId=null) {
  try {
    await fetch(`${SB_URL}/functions/v1/push-notify`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${SB_KEY}`, "apikey":SB_KEY },
      body: JSON.stringify({ familyId, title, body, excludeMemberId })
    });
  } catch(e) { console.warn("Push send failed:", e.message); }
}

async function sb(path, opts={}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers:{...H,...(opts.headers||{})}, ...opts });
  const txt = await res.text();
  if (!res.ok) { const e=JSON.parse(txt||"{}"); throw new Error(e.message||e.hint||`HTTP ${res.status}`); }
  return txt ? JSON.parse(txt) : null;
}
const sbGet  = (t,q="")   => sb(`${t}?${q}&apikey=${SB_KEY}`, { headers:{...H,"Accept":"application/json"} });
const sbPost = (t,body)   => sb(t, { method:"POST", body:JSON.stringify(body), headers:{...H,"Prefer":"return=representation"} });
const sbPatch= (t,q,body) => sb(`${t}?${q}`, { method:"PATCH", body:JSON.stringify(body), headers:{...H,"Prefer":"return=representation"} });
const sbDel  = (t,q)      => sb(`${t}?${q}`, { method:"DELETE", headers:H });

// ─── SUPABASE AUTH (email-based) ─────────────────────────────────────────────
async function sbSignUp(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email, password })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Signup failed");
  return d;
}
async function sbSignIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email, password })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Invalid email or password");
  return d;
}
async function sbSignOut(token) {
  await fetch(`${SB_URL}/auth/v1/logout`, {
    method:"POST", headers:{...H, Authorization:`Bearer ${token}`}
  });
}
async function sbSendResetEmail(email) {
  // Sends a password reset link to the user's email
  const res = await fetch(`${SB_URL}/auth/v1/recover`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Email not found. Please check and try again.");
  return d;
}
async function sbVerifyOTP(email, otp) {
  const res = await fetch(`${SB_URL}/auth/v1/verify`, {
    method:"POST", headers:H,
    body:JSON.stringify({ type:"recovery", email, token:otp })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Invalid or expired code. Please request a new one.");
  return d;
}
async function sbUpdatePassword(accessToken, newPassword) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method:"PUT", headers:{...H, Authorization:`Bearer ${accessToken}`},
    body:JSON.stringify({ password: newPassword })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Failed to update password");
  return d;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// ─── TRANSLATIONS ────────────────────────────────────────────────────────────
const T = {
  en: {
    // App
    appName: "Family Kitchen",
    appTagline: "Plan meals together, eat happily",
    brandedBy: "✅ Live — Designed by Revive Healthcare",
    // Auth
    signIn: "Sign In", register: "Register", createAccount: "Create Account",
    email: "Email Address", password: "Password", confirmPassword: "Confirm Password",
    username: "Username", usernameSub: "(visible to family members)",
    forgotPassword: "Forgot password?", sendResetLink: "📧 Send Reset Link",
    invitedLink: "Have an invite?", getJoiningLink: "Join your family",
    pleaseWait: "Please wait...",
    // Family setup
    setUpFamily: "Set Up Your Family", createFamily: "🏠 Create My Family",
    joinFamily: "🔗 Join Family", createFamilyLabel: "Create Family",
    joinFamilyLabel: "Join Family", startNewGroup: "Start a new group",
    useExistingId: "Use an existing Family ID",
    familyName: "Family Name", familyPassword: "Family Password",
    familyPasswordSub: "(share with members)", familyId: "Family ID",
    askKitchenHead: "Ask your Kitchen Head",
    // Nav
    dashboard: "Dashboard", foodDatabase: "Food Database",
    shopping: "Shopping", family: "Family", finalizeMenu: "Finalize Menu",
    // Dashboard
    weeklyMealPlanner: "Weekly Meal Planner", selectionsThisWeek: "selections this week",
    finalized: "finalized", viewAll: "View →", today: "TODAY", tomorrow: "TOMORROW",
    items: "items", clickToAdd: "Tap to add meals",
    // Meals
    breakfast: "Breakfast", lunch: "Lunch", eveningSnack: "Evening Snack", dinner: "Dinner",
    // Meal view
    currentSelections: "📋 Current Selections", searchItems: "Search items or ingredients…",
    favourites: "Favourites", allItems: "All Items",
    addTo: "Add to", info: "Info", addBtn: "+ Add",
    timesThisWeek: "time(s) this week",
    // Food DB
    foodDatabaseTitle: "Food Database", itemsTotal: "items total",
    addNewItem: "+ Add Item", csvImport: "CSV Import", aiImport: "AI Import",
    searchFoodItems: "Search food items...", editBtn: "Edit", delBtn: "Del",
    saveToDatabase: "💾 Save to Database", saving: "Saving...",
    cancel: "Cancel", addNewFoodItem: "Add New Food Item", editFoodItem: "Edit Food Item",
    foodPhoto: "Food Photo", optional: "optional", max2mb: "max 2MB",
    changePhoto: "Change Photo", uploadPhoto: "Upload Photo", removePhoto: "Remove",
    foodName: "Food Name", foodNameHi: "Food Name in Hindi (optional)",
    emoji: "Emoji", portionSize: "Portion Size", calories: "Calories (kcal)",
    protein: "Protein (g)", carbs: "Carbs (g)", fat: "Fat (g)", fiber: "Fiber (g)",
    categories: "Categories", selectAll: "(select all that apply)",
    atLeastOne: "Select at least one category",
    youtubeUrl: "YouTube URL", ingredients: "Ingredients",
    onePerLine: "(one per line)", recipeInstructions: "Recipe Instructions",
    // Shopping
    shoppingList: "Shopping List", itemsRemaining: "items remaining",
    haveItems: "have", addItem: "+ Add", refresh: "↻ Refresh",
    listTab: "📋 List", orderOnlineTab: "🛒 Order Online",
    shareOrSave: "📤 Share / Save", print: "🖨️ Print",
    noShoppingList: "No shopping list yet",
    noShoppingListSub: "The Kitchen Head must finalize the menu first",
    orderViaDelivery: "Choose a delivery app. You'll see all items with a search button against each one.",
    itemsTo: "items", searchOn: "🔍 Search",
    addedToCart: "✓ Added to Cart", skip: "Skip →", allDone: "🎉 All done!",
    allDoneSub: "All items have been added to your",
    // Finalize
    finalizeTitle: "Finalize Menu",
    finalizeSub: "Approve items for the week — only approved items go to the shopping list",
    printMenu: "🖨️ Print Menu", approved: "Approved", approve: "Approve",
    itemsApproved: "items approved", generateShoppingList: "🛒 Generate Shopping List →",
    noMealsPlanned: "No meals planned yet",
    // Family
    familyMembers: "Family Members", inviteMember: "Invite Family Member",
    inviteSub: "Enter their name and email. They register with that email to auto-join.",
    name: "Name", emailAddress: "Email Address", sendInvite: "📧 Send Invite",
    sending: "Sending...", adding: "Adding...",
    makeHead: "Make Head", remove: "Remove", shareInvite: "📤 Send Link", whatsapp: "💬 WhatsApp",
    invitePending: "⏳ Invite Pending", kitchenHead: "★ Head",
    howPendingJoin: "📋 How pending members join:",
    pendingStep1: "Tap 📤 Send Link on their card below",
    pendingStep2: "Send them the message via WhatsApp",
    pendingStep3: "They open the app link → tap Register",
    pendingStep4: "They register using the same email → auto-joined! ✅",
    familyIdAndPassword: "🔗 Family ID & Password",
    shareThisId: "Share this Family ID + family password with new members.",
    resetFamilyPassword: "🔑 Reset Family Password",
    newFamilyPassword: "New Family Password", confirmFamilyPassword: "Confirm Password",
    updatePassword: "Update Password", updating: "Updating...",
    signOut: "Sign Out",
    leaveFamily: "Leave Family", leaveFamilyConfirm: "Are you sure you want to leave this family group?",
    leaveFamilyWarn: "You will need to join or create a new family after leaving.",
    leaveFamilyHead: "You are the Kitchen Head. Please transfer the Head role to another member before leaving.",
    leaveFamilyLast: "You are the only member. Leaving will permanently delete this family group and all meal plans.",
    leaveFamilyLastConfirm: "Delete family group and all data?",
    transferFirst: "Transfer Head role first",
    makeHeadInvite: "Invite as Kitchen Head",
    makeHeadConfirm: "Send Kitchen Head invite to",
    makeHeadConfirmSub: "They must accept within 48 hours. You remain Head until they accept.",
    makeHeadPending: "Pending Head invite sent to",
    makeHeadPendingExp: "Expires in",
    makeHeadCancel: "Cancel Invite",
    makeHeadAccept: "Accept Head Role",
    makeHeadDecline: "Decline",
    makeHeadBanner: "has invited you to become the Kitchen Head",
    makeHeadBannerSub: "You will be able to finalize menus for the family.",
    makeHeadExpired: "Head invite expired — no transfer made.",
    makeHeadAccepted: "You are now the Kitchen Head! 👑",
    makeHeadDeclined: "Head invite declined.",
    makeHeadCancelled: "Head invite cancelled.",
    makeHeadInactiveWarn: "This member hasn't been active recently. Are you sure you want to send them the Head role invite?",
    leaving: "Leaving...",
    deleteAccount: "Delete My Account",
    deleteAccountSub: "Permanently delete your account and all your data",
    deleteAccountWarn: "This will permanently delete your account. Type DELETE to confirm.",
    deleteAccountHead: "You are the Kitchen Head. Transfer the Head role to another member before deleting your account.",
    deleteAccountLast: "You are the only member. Deleting your account will also permanently delete the entire family group and all meal plans.",
    deleting: "Deleting...",
    // AI Import
    aiTitle: "AI Recipe Generator",
    aiSub: "Type dish names one per line. Claude will generate full recipes and nutrition for all.",
    generateRecipes: "✨ Generate Recipes", generating: "Generating recipes... (15-20 sec)",
    saveAll: "💾 Save All", previewOf: "recipes", reviewSub: "Remove any you don't want then save all",
    // Portions & Nutrition
    portion: "Portion", kcal: "kcal", proteinLabel: "protein", carbsLabel: "carbs",
    fatLabel: "fat", fiberLabel: "fiber",
    // Language
    language: "Language",
    // Days
    days: { Monday:"Monday", Tuesday:"Tuesday", Wednesday:"Wednesday", Thursday:"Thursday", Friday:"Friday", Saturday:"Saturday", Sunday:"Sunday" },
    // Meal short names (for compact strips)
    mealShort: { Breakfast:"Bfast", Lunch:"Lunch", "Evening Snack":"Snack", Dinner:"Dinner" },
  },
  hi: {
    // App
    appName: "फैमिली किचन",
    appTagline: "मिलकर खाना बनाएं, खुशी से खाएं",
    brandedBy: "✅ लाइव — Revive Healthcare द्वारा डिज़ाइन",
    // Auth
    signIn: "साइन इन", register: "रजिस्टर", createAccount: "अकाउंट बनाएं",
    email: "ईमेल पता", password: "पासवर्ड", confirmPassword: "पासवर्ड की पुष्टि करें",
    username: "उपयोगकर्ता नाम", usernameSub: "(परिवार के सदस्यों को दिखाई देगा)",
    forgotPassword: "पासवर्ड भूल गए?", sendResetLink: "📧 रीसेट लिंक भेजें",
    invitedLink: "आमंत्रण मिला है?", getJoiningLink: "परिवार में शामिल हों",
    pleaseWait: "कृपया प्रतीक्षा करें...",
    // Family setup
    setUpFamily: "अपना परिवार सेट करें", createFamily: "🏠 परिवार बनाएं",
    joinFamily: "🔗 परिवार जॉइन करें", createFamilyLabel: "परिवार बनाएं",
    joinFamilyLabel: "परिवार जॉइन करें", startNewGroup: "नया परिवार ग्रुप शुरू करें",
    useExistingId: "मौजूदा Family ID उपयोग करें",
    familyName: "परिवार का नाम", familyPassword: "परिवार का पासवर्ड",
    familyPasswordSub: "(सदस्यों के साथ साझा करें)", familyId: "Family ID",
    askKitchenHead: "किचन हेड से पूछें",
    // Nav
    dashboard: "डैशबोर्ड", foodDatabase: "खाने का डेटाबेस",
    shopping: "खरीदारी", family: "परिवार", finalizeMenu: "मेनू फाइनल करें",
    // Dashboard
    weeklyMealPlanner: "साप्ताहिक भोजन योजना", selectionsThisWeek: "इस सप्ताह चयन",
    finalized: "फाइनल", viewAll: "देखें →", today: "आज", tomorrow: "कल",
    items: "आइटम", clickToAdd: "भोजन जोड़ने के लिए टैप करें",
    // Meals
    breakfast: "नाश्ता", lunch: "दोपहर का खाना", eveningSnack: "शाम का नाश्ता", dinner: "रात का खाना",
    // Meal view
    currentSelections: "📋 वर्तमान चयन", searchItems: "आइटम या सामग्री खोजें…",
    favourites: "पसंदीदा", allItems: "सभी आइटम",
    addTo: "जोड़ें", info: "जानकारी", addBtn: "+ जोड़ें",
    timesThisWeek: "बार इस सप्ताह",
    // Food DB
    foodDatabaseTitle: "खाने का डेटाबेस", itemsTotal: "आइटम कुल",
    addNewItem: "+ नया आइटम", csvImport: "CSV आयात", aiImport: "AI आयात",
    searchFoodItems: "खाने की चीज़ें खोजें...", editBtn: "संपादित", delBtn: "हटाएं",
    saveToDatabase: "💾 डेटाबेस में सहेजें", saving: "सहेज रहे हैं...",
    cancel: "रद्द करें", addNewFoodItem: "नया खाना जोड़ें", editFoodItem: "खाना संपादित करें",
    foodPhoto: "खाने की फोटो", optional: "वैकल्पिक", max2mb: "अधिकतम 2MB",
    changePhoto: "फोटो बदलें", uploadPhoto: "फोटो अपलोड करें", removePhoto: "हटाएं",
    foodName: "खाने का नाम (अंग्रेज़ी)", foodNameHi: "खाने का नाम (हिंदी)",
    emoji: "इमोजी", portionSize: "मात्रा", calories: "कैलोरी (kcal)",
    protein: "प्रोटीन (g)", carbs: "कार्बोहाइड्रेट (g)", fat: "वसा (g)", fiber: "फाइबर (g)",
    categories: "श्रेणियाँ", selectAll: "(सभी लागू विकल्प चुनें)",
    atLeastOne: "कम से कम एक श्रेणी चुनें",
    youtubeUrl: "YouTube लिंक", ingredients: "सामग्री",
    onePerLine: "(प्रत्येक एक लाइन में)", recipeInstructions: "बनाने की विधि",
    // Shopping
    shoppingList: "खरीदारी सूची", itemsRemaining: "आइटम शेष",
    haveItems: "पास में हैं", addItem: "+ जोड़ें", refresh: "↻ रीफ्रेश",
    listTab: "📋 सूची", orderOnlineTab: "🛒 ऑनलाइन ऑर्डर",
    shareOrSave: "📤 शेयर / सहेजें", print: "🖨️ प्रिंट",
    noShoppingList: "अभी कोई खरीदारी सूची नहीं",
    noShoppingListSub: "किचन हेड को पहले मेनू फाइनल करना होगा",
    orderViaDelivery: "डिलीवरी ऐप चुनें। हर आइटम के सामने सर्च बटन दिखेगा।",
    itemsTo: "आइटम", searchOn: "🔍 खोजें",
    addedToCart: "✓ कार्ट में जोड़ा", skip: "छोड़ें →", allDone: "🎉 हो गया!",
    allDoneSub: "सभी आइटम आपके",
    // Finalize
    finalizeTitle: "मेनू फाइनल करें",
    finalizeSub: "सप्ताह के लिए आइटम स्वीकृत करें — केवल स्वीकृत आइटम खरीदारी सूची में जाएंगे",
    printMenu: "🖨️ मेनू प्रिंट करें", approved: "स्वीकृत", approve: "स्वीकृत करें",
    itemsApproved: "आइटम स्वीकृत", generateShoppingList: "🛒 खरीदारी सूची बनाएं →",
    noMealsPlanned: "अभी कोई भोजन नियोजित नहीं",
    // Family
    familyMembers: "परिवार के सदस्य", inviteMember: "परिवार के सदस्य को आमंत्रित करें",
    inviteSub: "उनका नाम और ईमेल दर्ज करें। वे उसी ईमेल से रजिस्टर करके ऑटो-जॉइन होंगे।",
    name: "नाम", emailAddress: "ईमेल पता", sendInvite: "📧 आमंत्रण भेजें",
    sending: "भेज रहे हैं...", adding: "जोड़ रहे हैं...",
    makeHead: "हेड बनाएं", remove: "हटाएं", shareInvite: "📤 लिंक भेजें", whatsapp: "💬 WhatsApp",
    invitePending: "⏳ आमंत्रण लंबित", kitchenHead: "★ किचन हेड",
    howPendingJoin: "📋 लंबित सदस्य कैसे जॉइन करें:",
    pendingStep1: "नीचे उनके कार्ड पर 📤 लिंक भेजें टैप करें",
    pendingStep2: "WhatsApp पर संदेश भेजें",
    pendingStep3: "वे ऐप लिंक खोलें → रजिस्टर टैप करें",
    pendingStep4: "वे उसी ईमेल से रजिस्टर करें → ऑटो-जॉइन! ✅",
    familyIdAndPassword: "🔗 Family ID और पासवर्ड",
    shareThisId: "यह Family ID और पासवर्ड नए सदस्यों के साथ साझा करें।",
    resetFamilyPassword: "🔑 परिवार का पासवर्ड बदलें",
    newFamilyPassword: "नया परिवार पासवर्ड", confirmFamilyPassword: "पासवर्ड की पुष्टि करें",
    updatePassword: "पासवर्ड अपडेट करें", updating: "अपडेट हो रहा है...",
    signOut: "साइन आउट",
    leaveFamily: "परिवार छोड़ें", leaveFamilyConfirm: "क्या आप वाकई इस परिवार ग्रुप को छोड़ना चाहते हैं?",
    leaveFamilyWarn: "छोड़ने के बाद आपको नया परिवार बनाना या जॉइन करना होगा।",
    leaveFamilyHead: "आप किचन हेड हैं। छोड़ने से पहले किसी और को हेड बनाएं।",
    leaveFamilyLast: "आप अकेले सदस्य हैं। छोड़ने से पूरा परिवार ग्रुप और सभी डेटा हमेशा के लिए डिलीट हो जाएगा।",
    leaveFamilyLastConfirm: "परिवार ग्रुप और सारा डेटा डिलीट करें?",
    transferFirst: "पहले हेड बदलें",
    makeHeadInvite: "किचन हेड बनाने का निमंत्रण",
    makeHeadConfirm: "किचन हेड का निमंत्रण भेजें",
    makeHeadConfirmSub: "उन्हें 48 घंटे में स्वीकार करना होगा। स्वीकार होने तक आप हेड रहेंगे।",
    makeHeadPending: "हेड निमंत्रण भेजा गया",
    makeHeadPendingExp: "समाप्ति",
    makeHeadCancel: "निमंत्रण रद्द करें",
    makeHeadAccept: "हेड रोल स्वीकार करें",
    makeHeadDecline: "अस्वीकार करें",
    makeHeadBanner: "ने आपको किचन हेड बनने का निमंत्रण दिया है",
    makeHeadBannerSub: "आप परिवार के लिए मेनू फाइनल कर सकेंगे।",
    makeHeadExpired: "हेड निमंत्रण समाप्त हो गया — कोई बदलाव नहीं।",
    makeHeadAccepted: "अब आप किचन हेड हैं! 👑",
    makeHeadDeclined: "हेड निमंत्रण अस्वीकार कर दिया।",
    makeHeadCancelled: "हेड निमंत्रण रद्द कर दिया।",
    makeHeadInactiveWarn: "यह सदस्य हाल ही में सक्रिय नहीं रहा है। क्या आप वाकई उन्हें हेड निमंत्रण भेजना चाहते हैं?",
    leaving: "छोड़ रहे हैं...",
    deleteAccount: "अकाउंट डिलीट करें",
    deleteAccountSub: "आपका अकाउंट और सारा डेटा हमेशा के लिए हटा दिया जाएगा",
    deleteAccountWarn: "यह अकाउंट हमेशा के लिए डिलीट हो जाएगा। पुष्टि के लिए DELETE टाइप करें।",
    deleteAccountHead: "आप किचन हेड हैं। अकाउंट डिलीट करने से पहले किसी और को हेड बनाएं।",
    deleteAccountLast: "आप अकेले सदस्य हैं। अकाउंट डिलीट करने से पूरा परिवार ग्रुप और सभी डेटा भी हमेशा के लिए हट जाएगा।",
    deleting: "डिलीट हो रहा है...",
    // AI Import
    aiTitle: "AI रेसिपी जेनरेटर",
    aiSub: "प्रत्येक लाइन पर व्यंजन का नाम लिखें। Claude सभी के लिए पूरी रेसिपी बनाएगा।",
    generateRecipes: "✨ रेसिपी बनाएं", generating: "रेसिपी बन रही हैं... (15-20 सेकंड)",
    saveAll: "💾 सभी सहेजें", previewOf: "रेसिपी", reviewSub: "जो नहीं चाहिए हटाएं, फिर सभी सहेजें",
    // Portions & Nutrition
    portion: "मात्रा", kcal: "kcal", proteinLabel: "प्रोटीन", carbsLabel: "कार्ब्स",
    fatLabel: "वसा", fiberLabel: "फाइबर",
    // Language
    language: "भाषा",
    // Days
    days: { Monday:"सोमवार", Tuesday:"मंगलवार", Wednesday:"बुधवार", Thursday:"गुरुवार", Friday:"शुक्रवार", Saturday:"शनिवार", Sunday:"रविवार" },
    // Meal short names (for compact strips)
    mealShort: { Breakfast:"नाश्ता", Lunch:"दोपहर", "Evening Snack":"शाम", Dinner:"रात" },
  }
};

// Language context — read/write from localStorage
const getLang  = () => localStorage.getItem("fk_lang") || "en";
const setLang  = (l) => localStorage.setItem("fk_lang", l);
const LangCtx  = React.createContext("en");
const useLang  = () => React.useContext(LangCtx);
const useT     = () => T[React.useContext(LangCtx)] || T.en;

// Language toggle button component
function LangToggle({ lang, onChange, style={} }) {
  return (
    <button
      onClick={() => onChange(lang === "en" ? "hi" : "en")}
      style={{ background:"none", border:"1px solid currentColor", borderRadius:20, padding:"4px 12px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6, ...style }}>
      🌐 {lang === "en" ? "हिंदी" : "English"}
    </button>
  );
}

const DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const MEALS = ["Breakfast","Lunch","Evening Snack","Dinner"];
const MICONS= { Breakfast:"🌅", Lunch:"☀️", "Evening Snack":"🍵", Dinner:"🌙" };
const MCOLS = ["#F4A200","#2D6A4F","#C1440E","#6B5CE7","#E91E8C","#00BCD4","#FF5722","#009688"];
const SAPPS = [
  { name:"Blinkit",   url:"https://blinkit.com/s/?q=",                        color:"#F5C518", logo:"⚡" },
  { name:"Zepto",     url:"https://www.zeptonow.com/search?query=",            color:"#9B59B6", logo:"🟣" },
  { name:"Instamart", url:"https://www.swiggy.com/instamart/search?query=",    color:"#FC8019", logo:"🛒" },
  { name:"BigBasket", url:"https://www.bigbasket.com/ps/?q=",                  color:"#84C225", logo:"🛍️" },
  { name:"Amazon Now",url:"https://www.amazon.in/s?k=",                        color:"#FF9900", logo:"📦" },
];

// ─── SEED DATA (inserted once on first load) ─────────────────────────────────
const SEED_FOODS = [
  { name:"Aloo Matar", name_hi:"आलू मटर", category:"Lunch", emoji:"🥔", calories:220, protein:8, carbs:38, fat:3, youtube:"https://www.youtube.com/results?search_query=aloo+matar+recipe" },
  { name:"Baby Corn Palak Spinach Curry", name_hi:"बेबी कॉर्न पालक करी", category:"Lunch", emoji:"🌽", calories:180, protein:10, carbs:22, fat:5 },
  { name:"Besan Cheela", name_hi:"बेसन चीला", category:"Breakfast", emoji:"🫓", calories:180, protein:9, carbs:22, fat:5, youtube:"https://www.youtube.com/results?search_query=besan+cheela+recipe" },
  { name:"Bhindi Masala", name_hi:"भिंडी मसाला", category:"Lunch", emoji:"💚", calories:160, protein:5, carbs:22, fat:4, youtube:"https://www.youtube.com/results?search_query=bhindi+masala+recipe" },
  { name:"Butter Chicken", name_hi:"बटर चिकन", category:"Dinner", emoji:"🍗", calories:350, protein:30, carbs:18, fat:16, youtube:"https://www.youtube.com/results?search_query=butter+chicken+recipe" },
  { name:"Cauliflower Curry", name_hi:"फूलगोभी करी", category:"Lunch", emoji:"🥦", calories:165, protein:7, carbs:25, fat:3 },
  { name:"Chole Bhature", name_hi:"छोले भटूरे", category:"Lunch", emoji:"🍽️", calories:550, protein:18, carbs:78, fat:18, youtube:"https://www.youtube.com/results?search_query=chole+bhature+recipe" },
  { name:"Dahi Aloo", name_hi:"दही आलू", category:"Lunch", emoji:"🥛", calories:210, protein:8, carbs:35, fat:3 },
  { name:"Dal Baati Churma", name_hi:"दाल बाटी चूरमा", category:"Dinner", emoji:"🥮", calories:520, protein:22, carbs:80, fat:8, youtube:"https://www.youtube.com/results?search_query=dal+baati+churma+recipe" },
  { name:"Dal Tadka Rice", name_hi:"दाल तड़का चावल", category:"Lunch", emoji:"🍛", calories:420, protein:18, carbs:70, fat:8, youtube:"https://www.youtube.com/results?search_query=dal+tadka+recipe" },
  { name:"Egg Bhurji", name_hi:"अंडा भुर्जी", category:"Breakfast", emoji:"🍳", calories:220, protein:14.5, carbs:7, fat:15, youtube:"https://www.youtube.com/results?search_query=egg+bhurji+recipe" },
  { name:"Egg Omelette", name_hi:"अंडे का आमलेट", category:"Breakfast", emoji:"🍳", calories:180, protein:13.5, carbs:3.2, fat:13 },
  { name:"Fruit Salad", name_hi:"फ्रूट सलाद", category:"Evening Snack", emoji:"🍱", calories:150, protein:2, carbs:35, fat:1 },
  { name:"Garlic Paneer", name_hi:"लहसुन पनीर", category:"Lunch", emoji:"🧄", calories:260, protein:17, carbs:15, fat:14 },
  { name:"Gobhi Onion Paratha", name_hi:"गोभी प्याज पराठा", category:"Breakfast", emoji:"🫓", calories:320, protein:7.5, carbs:42, fat:13 },
  { name:"Hariyali Paneer Tikka", name_hi:"हरियाली पनीर टिक्का", category:"Evening Snack", emoji:"🧀", calories:125, protein:11, carbs:10, fat:8.5 },
  { name:"Idli Sambar", name_hi:"इडली सांभर", category:"Breakfast", emoji:"🍢", calories:300, protein:9, carbs:55, fat:4, youtube:"https://www.youtube.com/results?search_query=idli+sambar+recipe" },
  { name:"Kadhi Pakodi", name_hi:"कढ़ी पकोड़ी", category:"Lunch", emoji:"🟡", calories:220, protein:10, carbs:30, fat:6, youtube:"https://www.youtube.com/results?search_query=kadhi+pakoda+recipe" },
  { name:"Kali Dal", name_hi:"काली दाल", category:"Lunch", emoji:"⚫", calories:350, protein:20, carbs:50, fat:4, youtube:"https://www.youtube.com/results?search_query=kali+dal+recipe" },
  { name:"Khichdi", name_hi:"खिचड़ी", category:"Dinner", emoji:"🥘", calories:350, protein:14, carbs:60, fat:7, youtube:"https://www.youtube.com/results?search_query=khichdi+recipe" },
  { name:"Lal Masoor Dal", name_hi:"लाल मसूर दाल", category:"Lunch", emoji:"🍲", calories:210, protein:13.5, carbs:32, fat:4.5 },
  { name:"Masala Chai & Biscuits", name_hi:"मसाला चाय और बिस्किट", category:"Evening Snack", emoji:"☕", calories:120, protein:3, carbs:20, fat:4 },
  { name:"Masala Dosa", name_hi:"मसाला डोसा", category:"Breakfast", emoji:"🫓", calories:415, protein:9.5, carbs:62, fat:14, youtube:"https://www.youtube.com/results?search_query=masala+dosa+recipe" },
  { name:"Matar Paneer", name_hi:"मटर पनीर", category:"Lunch", emoji:"🧀", calories:320, protein:14.5, carbs:18, fat:21, youtube:"https://www.youtube.com/results?search_query=matar+paneer+recipe" },
  { name:"Mooli Parantha", name_hi:"मूली पराठा", category:"Breakfast", emoji:"🫓", calories:280, protein:7.2, carbs:38, fat:10.5 },
  { name:"Moong Dal Cheela", name_hi:"मूंग दाल चीला", category:"Breakfast", emoji:"🥞", calories:180, protein:10.5, carbs:22, fat:5.5 },
  { name:"Moong Dal Gravy", name_hi:"मूंग दाल ग्रेवी", category:"Lunch", emoji:"🍲", calories:210, protein:12.5, carbs:28, fat:6 },
  { name:"Mushroom Spinach Roll", name_hi:"मशरूम पालक रोल", category:"Lunch", emoji:"🍄", calories:240, protein:12, carbs:35, fat:5 },
  { name:"Oil Free Kadhai Paneer", name_hi:"बिना तेल कढ़ाई पनीर", category:"Lunch", emoji:"🧀", calories:250, protein:16, carbs:16, fat:13 },
  { name:"Oil Free Tadka Dal", name_hi:"बिना तेल तड़का दाल", category:"Lunch", emoji:"🍲", calories:260, protein:16, carbs:42, fat:2 },
  { name:"Pakora", name_hi:"पकोड़ा", category:"Evening Snack", emoji:"🍘", calories:200, protein:5, carbs:24, fat:10 },
  { name:"Palak Paneer", name_hi:"पालक पनीर", category:"Dinner", emoji:"🍃", calories:280, protein:14, carbs:12, fat:18, youtube:"https://www.youtube.com/results?search_query=palak+paneer+recipe" },
  { name:"Paneer Butter Masala", name_hi:"पनीर बटर मसाला", category:"Lunch", emoji:"🧀", calories:380, protein:22, carbs:18, fat:26, youtube:"https://www.youtube.com/results?search_query=paneer+butter+masala+recipe" },
  { name:"Paratha with Curd", name_hi:"दही के साथ परांठा", category:"Breakfast", emoji:"🫓", calories:380, protein:10, carbs:55, fat:14 },
  { name:"Pav Bhaji", name_hi:"पाव भाजी", category:"Street Food", emoji:"🍞", calories:420, protein:10.5, carbs:62, fat:14, youtube:"https://www.youtube.com/results?search_query=pav+bhaji+recipe" },
  { name:"Pindi Channa", name_hi:"पिंडी छोले", category:"Lunch", emoji:"🍛", calories:320, protein:16, carbs:50, fat:6, youtube:"https://www.youtube.com/results?search_query=pindi+chana+recipe" },
  { name:"Poha", name_hi:"पोहा", category:"Breakfast", emoji:"🍚", calories:250, protein:6, carbs:45, fat:5, youtube:"https://www.youtube.com/results?search_query=poha+recipe" },
  { name:"Rajma Chawal", name_hi:"राजमा चावल", category:"Lunch", emoji:"🫘", calories:450, protein:20, carbs:75, fat:7, youtube:"https://www.youtube.com/results?search_query=rajma+chawal+recipe" },
  { name:"Roti Sabzi", name_hi:"रोटी सब्जी", category:"Dinner", emoji:"🫓", calories:320, protein:10, carbs:52, fat:9 },
  { name:"Sabudana Vada", name_hi:"साबूदाना वड़ा", category:"Evening Snack", emoji:"🟡", calories:100, protein:2.4, carbs:15, fat:5 },
  { name:"Sambar", name_hi:"सांभर", category:"Breakfast", emoji:"🍲", calories:150, protein:7.5, carbs:22, fat:3.5 },
  { name:"Samosa", name_hi:"समोसा", category:"Evening Snack", emoji:"🥟", calories:250, protein:5, carbs:35, fat:11 },
  { name:"Shahi Paneer", name_hi:"शाही पनीर", category:"Lunch", emoji:"🧀", calories:310, protein:18, carbs:20, fat:16, youtube:"https://www.youtube.com/results?search_query=shahi+paneer+recipe" },
  { name:"Shimla Mirch Paneer", name_hi:"शिमला मिर्च पनीर वाली", category:"Lunch", emoji:"🫑", calories:230, protein:15, carbs:18, fat:10 },
  { name:"Soya Bhurji", name_hi:"सोया भुर्जी", category:"Breakfast", emoji:"🥘", calories:220, protein:18, carbs:14, fat:10 },
  { name:"Soya Chunks Curry", name_hi:"सोया चंक्स करी", category:"Lunch", emoji:"🍛", calories:280, protein:22, carbs:18, fat:12 },
  { name:"Sprouts Salad", name_hi:"अंकुरित सलाद", category:"Salad", emoji:"🥗", calories:150, protein:9.5, carbs:22, fat:3 },
  { name:"Stuffed Capsicum", name_hi:"भरी हुई शिमला मिर्च", category:"Lunch", emoji:"🫑", calories:195, protein:9, carbs:30, fat:4 },
  { name:"Tariwali Lauki", name_hi:"तरीवाली लौकी", category:"Lunch", emoji:"🥒", calories:120, protein:4, carbs:18, fat:2 },
  { name:"Upma", name_hi:"उपमा", category:"Breakfast", emoji:"🥣", calories:220, protein:7, carbs:40, fat:6, youtube:"https://www.youtube.com/results?search_query=upma+recipe" },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',system-ui,sans-serif;background:#FFF8F0;}
.serif{font-family:'Playfair Display',serif;}
.card{background:#fff;border-radius:14px;border:1px solid #ede5d8;padding:16px;}
.card-hover{transition:all .2s;cursor:pointer;}
.card-hover:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(244,162,0,.12);border-color:#F4A200;}
.btn{border:none;cursor:pointer;border-radius:10px;font-weight:600;font-size:14px;transition:all .18s;padding:10px 20px;}
.btn-p{background:#F4A200;color:#fff;}
.btn-p:hover{background:#e09800;}
.btn-p:disabled{background:#f5c542;cursor:not-allowed;}
.btn-g{background:#fff;color:#444;border:1px solid #ddd;}
.btn-g:hover{background:#f5f5f5;}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:8px;}
.btn-danger{background:#fff;color:#C1440E;border:1px solid #ffcccc;}
.btn-danger:hover{background:#fff5f5;}
.nav-btn{background:none;border:none;cursor:pointer;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:500;color:#666;display:flex;align-items:center;gap:7px;transition:all .18s;width:100%;}
.nav-btn:hover{background:#f5ede0;color:#1A1A2E;}
.nav-btn.act{background:#F4A200;color:#fff;}
.input{width:100%;padding:9px 13px;border-radius:9px;border:1px solid #ddd;font-size:14px;outline:none;transition:border .18s;}
.input:focus{border-color:#F4A200;}
.tag{background:#f0f0f0;color:#555;padding:3px 9px;border-radius:20px;font-size:12px;display:inline-block;}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;}
.chip{padding:6px 14px;border-radius:20px;border:none;font-size:13px;cursor:pointer;font-weight:500;transition:all .18s;}
.food-card{border:1px solid #ede5d8;border-radius:13px;padding:13px;background:#fff;cursor:pointer;transition:all .18s;}
.food-card:hover{border-color:#F4A200;transform:translateY(-2px);box-shadow:0 4px 14px rgba(244,162,0,.14);}
.meal-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f5f0e8;}
.meal-row:last-child{border-bottom:none;}
.spinner{width:36px;height:36px;border:3px solid #f0e8d8;border-top-color:#F4A200;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto;}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.18);animation:fadeIn .25s ease;max-width:300px;}
@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
.nut-pill{border-radius:9px;padding:9px 6px;text-align:center;}
@media(max-width:660px){
  .sidebar{display:none!important;}
  .bnav{display:flex!important;}
  .main-pad{padding:14px 14px 130px!important;}
  .grid-2{grid-template-columns:1fr!important;}
  .meal-strip{grid-template-columns:repeat(4,1fr)!important;}
}
`;

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState("login");   // login | app | resetpw
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser]   = useState(null);  // supabase auth user
  const [member, setMember]   = useState(null);      // members table row
  const [family, setFamily]   = useState(null);      // families table row
  const [members, setMembers] = useState([]);
  const [foods,   setFoods]   = useState([]);
  const [planner, setPlanner] = useState([]);        // planner_items rows
  const [favs,    setFavs]    = useState({});        // { food_id: true }
  const [usageCnt,setUsageCnt]= useState({});        // { food_name: count }
  const [view,    setView]    = useState("dashboard");
  const [selDay,      setSelDay]      = useState(null);
  const [selMeal,     setSelMeal]     = useState(null);
  const [selMealView, setSelMealView] = useState(null); // meal-across-week view
  const [toast,   setToast]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [recoveryToken,   setRecoveryToken]   = useState(null); // for password reset
  const [autoInvite,      setAutoInvite]       = useState(false); // auto-open invite popup
  const [autoInviteEmail, setAutoInviteEmail]  = useState("");    // pre-filled email from URL
  const [lang,            setLangState]        = useState(getLang); // "en" | "hi"

  const changeLang = (l) => { setLang(l); setLangState(l); };
  const [installPrompt,   setInstallPrompt]   = useState(null); // PWA install prompt
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // ── Detect Supabase recovery redirect (hash contains access_token) ──────────
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace("#",""));
    const accessToken = params.get("access_token");
    const type        = params.get("type");
    if (accessToken && type === "recovery") {
      window.history.replaceState(null, "", window.location.pathname);
      setRecoveryToken(accessToken);
      setScreen("resetpw");
    }
  }, []);

  // ── Auto-open invite popup if URL has ?invite=true ────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") === "true") {
      const emailParam = params.get("email") || "";
      window.history.replaceState(null, "", window.location.pathname);
      setAutoInvite(true);
      if (emailParam) setAutoInviteEmail(decodeURIComponent(emailParam));
    }
  }, []);

  // ── Capture PWA install prompt ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallBanner(false);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      // Fallback for iOS (Safari doesn't support beforeinstallprompt)
      setShowInstallBanner(false);
      showToast("On iPhone: tap Share → Add to Home Screen 📱", "info");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      showToast("Family Kitchen added to your home screen! 🎉");
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  };

  // ── Restore saved session on app load (remember me for 48 hrs) ──────────────
  useEffect(() => {
    const raw = localStorage.getItem("fk_session");
    if (!raw) return;
    try {
      const session = JSON.parse(raw);
      const now = Date.now();
      if (!session.expiresAt || now > session.expiresAt) {
        localStorage.removeItem("fk_session");
        return;
      }
      // Session is valid — restore without asking to login again
      setAuthToken(session.token);
      setAuthUser(session.sbUser);
      setMember(session.member);
      setLoading(true);
      loadAll(session.member.family_id).then(() => {
        setScreen("app");
        setLoading(false);
        setTimeout(() => initPush(session.member.id), 2000);
      }).catch(() => {
        localStorage.removeItem("fk_session");
        setLoading(false);
      });
    } catch(e) {
      localStorage.removeItem("fk_session");
    }
  }, []); // eslint-disable-line

  const showToast = useCallback((msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── after login: load family, members, foods, planner ──
  const loadAll = useCallback(async (fid) => {
    setLoading(true);
    try {
      const [fam, mems, fds, plan] = await Promise.all([
        sbGet("families", `id=eq.${fid}&select=*`),
        sbGet("members",  `family_id=eq.${fid}&select=*`),
        sbGet("foods",    `select=*&order=category,name`),
        sbGet("planner_items", `family_id=eq.${fid}&select=*`),
      ]);
      setFamily(fam?.[0]);
      setMembers(mems||[]);
      if (!fds || fds.length===0) {
        // seed foods
        await sbPost("foods", SEED_FOODS);
        const seeded = await sbGet("foods","select=*&order=category,name");
        setFoods(seeded||[]);
      } else {
        setFoods(fds);
      }
      setPlanner(plan||[]);
      // Load favourites from localStorage (per member)
      const storedFavs = JSON.parse(localStorage.getItem(`fk_favs_${fid}`) || '{}');
      setFavs(storedFavs);
      // Build usage counts from all planner items
      const counts = {};
      (plan||[]).forEach(p => { counts[p.food_name] = (counts[p.food_name]||0) + 1; });
      setUsageCnt(counts);
    } catch(e) { showToast(e.message,"error"); }
    setLoading(false);
  }, [showToast]);

  // ── Back button: push a new history entry on every navigation ─────────────────
  // We maintain our own navStack to know exactly where to go back to
  const navStack = React.useRef([]);

  const navigate = useCallback((fn, label) => {
    // Push current state before navigating
    navStack.current.push({ view, selDay, selMeal, selMealView });
    window.history.pushState({ idx: navStack.current.length }, "", window.location.pathname);
    fn(); // perform the navigation
  }, [view, selDay, selMeal, selMealView]);

  useEffect(() => {
    if (screen !== "app") return;

    const handleBack = () => {
      const prev = navStack.current.pop();
      if (!prev) return; // nothing to go back to — OS handles it
      // Restore previous state
      setView(prev.view);
      setSelDay(prev.selDay);
      setSelMeal(prev.selMeal);
      setSelMealView(prev.selMealView);
      // Keep a state in history so next back press is catchable
      window.history.pushState({ idx: navStack.current.length }, "", window.location.pathname);
    };

    window.addEventListener("popstate", handleBack);
    // Seed one entry so first back press is interceptable
    window.history.pushState({ idx: 0 }, "", window.location.pathname);
    return () => window.removeEventListener("popstate", handleBack);
  }, [screen]); // eslint-disable-line

  // ── Background sync — refresh planner + members every 30 seconds ─────────────
  const syncData = useCallback(async (fid) => {
    if (!fid) return;
    try {
      const [plan, mems] = await Promise.all([
        sbGet("planner_items", `family_id=eq.${fid}&select=*`),
        sbGet("members",       `family_id=eq.${fid}&select=*`),
      ]);
      setPlanner(prev => {
        // Only update if data actually changed (avoid unnecessary re-renders)
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(plan||[]);
        return prevStr === nextStr ? prev : (plan||[]);
      });
      setMembers(prev => {
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(mems||[]);
        return prevStr === nextStr ? prev : (mems||[]);
      });
      // Rebuild usage counts from latest planner
      const counts = {};
      (plan||[]).forEach(p => { counts[p.food_name] = (counts[p.food_name]||0) + 1; });
      setUsageCnt(counts);
    } catch(e) { /* silent — don't toast on background sync errors */ }
  }, []);

  useEffect(() => {
    if (screen !== "app" || !family?.id) return;
    // Sync immediately when screen becomes active
    syncData(family.id);
    // Then poll every 30 seconds
    const interval = setInterval(() => syncData(family.id), 30000);
    // Also sync when tab becomes visible again (user switches back to tab)
    const onVisible = () => { if (document.visibilityState === "visible") syncData(family.id); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [screen, family?.id, syncData]);

  // Register push notifications after login
  const initPush = useCallback(async (memberId) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    if (Notification.permission === "granted") {
      await registerPush(memberId);
    }
  }, []);

  const isHead = member && family && member.id === family.head_id;

  const toggleFav = useCallback((foodId) => {
    setFavs(prev => {
      const next = { ...prev, [foodId]: !prev[foodId] };
      if (!next[foodId]) delete next[foodId];
      localStorage.setItem(`fk_favs_${family?.id}`, JSON.stringify(next));
      return next;
    });
  }, [family]);

  // ── derived planner helpers ──
  const getDayMealItems = (day, meal) => planner.filter(p => p.day===day && p.meal===meal);
  const getMealSummary  = (day, meal) => {
    const items = getDayMealItems(day, meal);
    const byMember = {};
    items.forEach(i => { if(!byMember[i.member_name]) byMember[i.member_name]=[]; byMember[i.member_name].push(i.food_name); });
    return byMember;
  };

  const addToPlanner = async (day, meal, food) => {
    if (!member) return;
    const exists = planner.find(p => p.day===day && p.meal===meal && p.food_name===food.name && p.member_name===member.name);
    if (exists) { showToast("Already added!","info"); return; }
    try {
      const row = { family_id:family.id, day, meal, food_name:food.name, food_emoji:food.emoji, member_name:member.name, finalized:false };
      const [saved] = await sbPost("planner_items", [row]);
      setPlanner(p => [...p, saved]);
      setUsageCnt(c => ({ ...c, [food.name]: (c[food.name]||0)+1 }));
      showToast(`${food.name} added to ${day}'s ${meal}!`);
      // Notify other family members
      sendPushNotification(family.id, `🍽️ ${member.name} added to ${meal}`, `${food.name} for ${day}`, member.id);
    } catch(e) { showToast(e.message,"error"); }
  };

  const removeFromPlanner = async (id) => {
    try {
      await sbDel("planner_items", `id=eq.${id}`);
      setPlanner(p => p.filter(i => i.id!==id));
    } catch(e) { showToast(e.message,"error"); }
  };

  const toggleFinalized = async (id, cur) => {
    if (!isHead) return;
    try {
      await sbPatch("planner_items", `id=eq.${id}`, { finalized:!cur });
      setPlanner(p => p.map(i => i.id===id ? {...i, finalized:!cur} : i));
      // Notify all family members when head approves
      if (!cur) {
        const item = planner.find(i => i.id===id);
        if (item) sendPushNotification(family.id, `✅ Menu Approved by ${member.name}`, `${item.food_name} on ${item.day} (${item.meal}) is confirmed!`);
      }
    } catch(e) { showToast(e.message,"error"); }
  };

  const generateShoppingList = () => {
    const finalItems = planner.filter(p => p.finalized);
    const ingMap = {};
    finalItems.forEach(pi => {
      const food = foods.find(f => f.name===pi.food_name);
      if (!food) return;
      (food.ingredients||[]).forEach(ing => {
        const key = ing.toLowerCase().trim();
        if (!ingMap[key]) ingMap[key] = { name:ing, days:[], checked:false };
        ingMap[key].days.push(`${pi.day} ${pi.meal}`);
      });
    });
    return Object.values(ingMap);
  };

  // ── Password Reset screen (after Supabase recovery redirect) ───────────────
  const t = T[lang] || T.en;

  if (screen==="resetpw") return (
    <>
      <style>{CSS}</style>
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E":"#2D6A4F" }}>{toast.msg}</div>}
      <ResetPasswordScreen
        recoveryToken={recoveryToken}
        onDone={() => { setRecoveryToken(null); setScreen("login"); }}
        showToast={(msg,type) => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); }}
      />
    </>
  );

  if (screen==="login") return (
    <>
      <style>{CSS}</style>
      <LangCtx.Provider value={lang}>
      <LoginScreen lang={lang} onLangChange={changeLang} autoInvite={autoInvite} autoInviteEmail={autoInviteEmail} onAutoInviteDone={()=>{ setAutoInvite(false); setAutoInviteEmail(""); }} onLogin={async (token, sbUser, mem, fid) => {
        setAuthToken(token); setAuthUser(sbUser); setMember(mem);
        await loadAll(fid);
        setScreen("app");
        showToast(`Welcome, ${mem.name}! 🎉`);
        // Save session for 48 hours (remember me)
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
        localStorage.setItem("fk_session", JSON.stringify({ token, sbUser, member:mem, expiresAt }));
        // Request push permission after a short delay so UI is ready
        setTimeout(() => initPush(mem.id), 2000);
      }} showToast={showToast} />
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E": toast.type==="info"?"#6B5CE7":"#2D6A4F" }}>{toast.msg}</div>}
      </LangCtx.Provider>
    </>
  );

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:16 }}>
        <div className="spinner" />
        <div style={{ color:"#888", fontSize:14 }}>Loading Family Kitchen…</div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E": toast.type==="info"?"#6B5CE7":"#2D6A4F" }}>{toast.msg}</div>}

      <LangCtx.Provider value={lang}>
      <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        {/* HEADER */}
        <header style={{ background:"#fff", borderBottom:"1px solid #ede5d8", padding:"0 20px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:26 }}>👨‍👩‍👧‍👦</span>
            <div>
              <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>Family Kitchen</div>
              <div style={{ fontSize:11, color:"#999", lineHeight:1 }}>{family?.name} · <span style={{ color:"#555" }}>{member?.name||member?.username}</span>{isHead&&<span style={{ color:"#F4A200", fontWeight:700 }}> ★</span>}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#bbb", marginRight:4 }}>ID: {family?.id?.slice(0,8)}</span>
            {showInstallBanner && (
              <button
                onClick={handleInstall}
                style={{ background:"#2D6A4F", color:"#fff", border:"none", padding:"7px 12px", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}
                title="Add to Home Screen">
                📲 Install App
              </button>
            )}
            <LangToggle lang={lang} onChange={changeLang} style={{ color:"#555", fontSize:12 }} />
            <button className="btn btn-g btn-sm" onClick={async()=>{ if(authToken) await sbSignOut(authToken); localStorage.removeItem("fk_session"); setAuthToken(null); setAuthUser(null); setScreen("login"); setMember(null); setFamily(null); setMembers([]); setFoods([]); setPlanner([]); }}>{t.signOut}</button>
          </div>
        </header>

        <div style={{ display:"flex", flex:1 }}>
          {/* SIDEBAR */}
          <aside className="sidebar" style={{ width:185, background:"#fff", borderRight:"1px solid #ede5d8", padding:"14px 10px", display:"flex", flexDirection:"column", gap:3, position:"sticky", top:60, height:"calc(100vh - 60px)", overflowY:"auto" }}>
            {[["dashboard","📅",t.dashboard],["foods","🍱",t.foodDatabase]].map(([v,ic,lb])=>(
              <button key={v} className={`nav-btn ${view===v?"act":""}`} onClick={()=>navigate(()=>{ setView(v); setSelDay(null); setSelMeal(null); setSelMealView(null); }, v)}>{ic} {lb}</button>
            ))}
            {isHead && (
              <>
                <div style={{ borderTop:"1px dashed #ede5d8", margin:"8px 0" }} />
                <button className={`nav-btn ${view==="finalize"?"act":""}`} onClick={()=>navigate(()=>{ setView("finalize"); setSelDay(null); setSelMeal(null); setSelMealView(null); }, "finalize")}>✅ {t.finalizeMenu}</button>
              </>
            )}
            <button className={`nav-btn ${view==="shopping"?"act":""}`} onClick={()=>navigate(()=>{ setView("shopping"); setSelDay(null); setSelMeal(null); setSelMealView(null); }, "shopping")}>🛒 {t.shopping}</button>
            <div style={{ borderTop:"1px dashed #ede5d8", margin:"8px 0" }} />
            <button className={`nav-btn ${view==="family"?"act":""}`} onClick={()=>navigate(()=>{ setView("family"); setSelDay(null); setSelMeal(null); setSelMealView(null); }, "family")}>👥 {t.family}</button>
            <button className={`nav-btn ${view==="settings"?"act":""}`} onClick={()=>navigate(()=>{ setView("settings"); setSelDay(null); setSelMeal(null); setSelMealView(null); }, "settings")}>⚙️ {lang==="hi"?"सेटिंग्स":"Settings"}</button>
            <div style={{ flex:1 }} />
            <div style={{ padding:"10px 8px", background:"#fff8f0", borderRadius:10, fontSize:11, color:"#a87800" }}>
              <div style={{ fontWeight:700 }}>Family ID</div>
              <div style={{ fontFamily:"monospace", wordBreak:"break-all", marginTop:2 }}>{family?.id}</div>
            </div>
          </aside>

          {/* MAIN */}
          <main className="main-pad" style={{ flex:1, padding:"22px 24px", overflowY:"auto", paddingBottom:120 }}>
            {view==="dashboard" && !selDay && !selMealView && <DashboardView days={DAYS} meals={MEALS} planner={planner} getMealSummary={getMealSummary} onDayClick={(d)=>navigate(()=>setSelDay(d), d)} onMealViewClick={(m)=>navigate(()=>setSelMealView(m), m)} MICONS={MICONS} MCOLS={MCOLS} showInstallBanner={showInstallBanner} onInstall={handleInstall} member={member} family={family} members={members} setMembers={setMembers} setFamily={setFamily} showToast={showToast} foods={foods} />}
            {view==="dashboard" && selMealView && !selDay && <MealWeekView meal={selMealView} days={DAYS} planner={planner} foods={foods} member={member} onBack={()=>setSelMealView(null)} onAdd={addToPlanner} getDayMealItems={getDayMealItems} MICONS={MICONS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} onDayClick={(d)=>navigate(()=>{ setSelMealView(null); setSelDay(d); setSelMeal(selMealView); }, d)} />}
            {view==="dashboard" && selDay && !selMeal && <DayView day={selDay} meals={MEALS} planner={planner} getMealSummary={getMealSummary} onBack={()=>{ setSelDay(null); }} onMealClick={(m)=>navigate(()=>setSelMeal(m), m)} MICONS={MICONS} MCOLS={MCOLS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} member={member} foods={foods} />}
            {view==="dashboard" && selDay && selMeal && <MealView day={selDay} meal={selMeal} foods={foods} member={member} onBack={()=>setSelMeal(null)} onAdd={addToPlanner} getMealSummary={getMealSummary} getDayMealItems={getDayMealItems} MICONS={MICONS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} />}
            {view==="foods"     && <FoodsView foods={foods} setFoods={setFoods} showToast={showToast} MEALS={MEALS} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} />}
            {view==="shopping"  && <ShoppingView genList={generateShoppingList} planner={planner} SAPPS={SAPPS} showToast={showToast} isHead={isHead} />}
            {view==="family"    && <FamilyView family={family} setFamily={setFamily} members={members} setMembers={setMembers} member={member} showToast={showToast} MCOLS={MCOLS} isHead={isHead} onLeaveFamily={async () => {
              // Clear session and log out — they land on family setup
              if(authToken) await sbSignOut(authToken);
              localStorage.removeItem("fk_session");
              setAuthToken(null); setAuthUser(null); setMember(null);
              setFamily(null); setMembers([]); setFoods([]); setPlanner([]);
              setView("dashboard"); setScreen("login");
            }} />}
            {view==="settings"  && <SettingsView member={member} family={family} showToast={showToast} lang={lang} onLangChange={changeLang} isHead={isHead} members={members} authToken={authToken} onDeleteAccount={async () => {
              localStorage.removeItem("fk_session");
              setAuthToken(null); setAuthUser(null); setMember(null);
              setFamily(null); setMembers([]); setFoods([]); setPlanner([]);
              setView("dashboard"); setScreen("login");
            }} />}
            {view==="finalize"  && isHead && <FinalizeView days={DAYS} meals={MEALS} planner={planner} onToggle={toggleFinalized} onGenShopping={()=>navigate(()=>setView("shopping"), "shopping")} MICONS={MICONS} MCOLS={MCOLS} foods={foods} />}
          </main>
        </div>

        {/* BOTTOM NAV (mobile) */}
        <nav className="bnav" style={{ display:"none", position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #ede5d8", padding:"6px 8px", justifyContent:"space-around", zIndex:100 }}>
          {[["dashboard","📅",t.dashboard],["foods","🍱",t.foodDatabase],...(isHead?[["finalize","✅",t.finalizeMenu]]:[]),["shopping","🛒",t.shopping],["family","👥",t.family],["settings","⚙️",lang==="hi"?"सेटिंग्स":"Settings"]].map(([v,ic,lb])=>(
            <button key={v} onClick={()=>navigate(()=>{ setView(v); setSelDay(null); setSelMeal(null); setSelMealView(null); }, v)} style={{ background:view===v?"#fff8e1":"none", border:"none", cursor:"pointer", padding:"7px 10px", borderRadius:10, display:"flex", flexDirection:"column", alignItems:"center", gap:2, flex:1 }}>
              <span style={{ fontSize:18 }}>{ic}</span>
              <span style={{ fontSize:10, color:view===v?"#F4A200":"#999", fontWeight:500 }}>{lb}</span>
            </button>
          ))}
        </nav>
      </div>
      </LangCtx.Provider>
    </>
  );
}

// ─── RESET PASSWORD SCREEN (after Supabase magic link redirect) ─────────────
function ResetPasswordScreen({ recoveryToken, onDone, showToast }) {
  const [newPw,   setNewPw]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);
  const [counter, setCounter] = useState(5);

  // Countdown timer after success
  React.useEffect(() => {
    if (!done) return;
    if (counter <= 0) { onDone(); return; }
    const t = setTimeout(() => setCounter(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, counter]); // eslint-disable-line

  const handleReset = async () => {
    if (newPw.length < 6) { showToast("Password must be at least 6 characters","error"); return; }
    if (newPw !== confirm) { showToast("Passwords do not match","error"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        method:"PUT",
        headers:{ ...H, Authorization:`Bearer ${recoveryToken}` },
        body: JSON.stringify({ password: newPw })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.msg||d.error_description||"Failed to update password");

      // Link auth_id to pending member row if this was an invite
      try {
        if (d.email && d.id) {
          const mems = await sbGet("members", `email=eq.${encodeURIComponent(d.email)}&select=*`);
          if (mems?.length && !mems[0].auth_id) {
            await sbPatch("members", `id=eq.${mems[0].id}`, { auth_id: d.id });
          }
        }
      } catch(_) {}

      // Clear hash BEFORE setting done to prevent re-detection
      window.history.replaceState(null, "", window.location.pathname);
      setDone(true);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(150deg,#FFF8F0,#FFF0CC 60%,#FFF8F0)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>

        {done ? (
          /* ── Success Screen ── */
          <div style={{ background:"#fff", borderRadius:24, padding:36, border:"1px solid #ede5d8", textAlign:"center", boxShadow:"0 8px 40px rgba(0,0,0,.08)" }}>
            <div style={{ fontSize:72, marginBottom:8 }}>🎉</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#1A1A2E", margin:"0 0 10px" }}>Password Set!</h2>
            <p style={{ fontSize:14, color:"#555", lineHeight:1.7, marginBottom:24 }}>
              Your password has been set successfully.<br/>You can now sign in to Family Kitchen.
            </p>
            {/* Countdown */}
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"12px 20px", marginBottom:20 }}>
              <p style={{ fontSize:13, color:"#2D6A4F", margin:0 }}>
                Redirecting to sign in in <b>{counter}s</b>...
              </p>
            </div>
            <button
              onClick={onDone}
              style={{ width:"100%", background:"#F4A200", color:"#fff", border:"none", padding:14, borderRadius:12, fontWeight:700, fontSize:16, cursor:"pointer" }}>
              Sign In Now →
            </button>
          </div>
        ) : (
          /* ── Password Form ── */
          <>
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <div style={{ fontSize:64 }}>🔒</div>
              <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:"#1A1A2E", marginTop:10 }}>Set Your Password</h1>
              <p style={{ color:"#999", fontSize:13, marginTop:6 }}>Choose a password to access your Family Kitchen account</p>
            </div>
            <div style={{ background:"#fff", borderRadius:20, padding:28, border:"1px solid #ede5d8" }}>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>New Password</label>
                <PwInput value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" />
              </div>
              <div style={{ marginBottom:22 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>Confirm Password</label>
                <PwInput value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password"
                  onKeyDown={e=>e.key==="Enter"&&handleReset()} />
              </div>
              <button onClick={handleReset} disabled={busy}
                style={{ width:"100%", background:"#F4A200", color:"#fff", border:"none", padding:14, borderRadius:12, fontWeight:700, fontSize:16, cursor:busy?"not-allowed":"pointer", opacity:busy?0.7:1 }}>
                {busy ? "Setting password..." : "Set My Password →"}
              </button>
            </div>
            <div style={{ marginTop:14, background:"rgba(45,106,79,.08)", borderRadius:12, padding:"9px 14px", textAlign:"center" }}>
              <p style={{ fontSize:12, color:"#2D6A4F" }}>✅ Live — Designed by Revive Healthcare</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ─── INVITE POPUP ─────────────────────────────────────────────────────────────
function InvitePopup({ show, onClose, showToast, initialEmail="" }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy,  setBusy]  = useState(false);
  const [sent,  setSent]  = useState(false);

  React.useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);

  if (!show) return null;

  const handleSend = async () => {
    const em = email.trim().toLowerCase();
    if (!em) { showToast("Please enter your email","error"); return; }
    setBusy(true);
    try {
      const invited = await sbGet("members", `email=eq.${encodeURIComponent(em)}&select=family_id,name`);
      if (!invited?.length) {
        showToast("This email has not been invited yet. Ask your Kitchen Head to add you first.","error");
        setBusy(false); return;
      }
      // Use our Edge Function which sends via Hostinger SMTP (reliable delivery)
      const SB_URL = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
      const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
      const inviteRes = await fetch(`${SB_URL}/functions/v1/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY },
        body: JSON.stringify({ email: em, memberName: em.split("@")[0] })
      });
      const inviteData = await inviteRes.json();
      if (!inviteRes.ok || inviteData.error) throw new Error(inviteData.error || "Failed to send invite email");
      setSent(true);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleClose = () => { setEmail(""); setSent(false); setBusy(false); onClose(); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:400, position:"relative", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <button onClick={handleClose} style={{ position:"absolute", top:14, right:16, background:"none", border:"none", fontSize:24, cursor:"pointer", color:"#aaa", lineHeight:1 }}>×</button>

        {sent ? (
          /* ── Confirmation screen — clean, no WhatsApp ── */
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <div style={{ fontSize:56 }}>📬</div>
            <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, marginTop:14, color:"#1A1A2E" }}>
              Check your email
            </h3>
            <p style={{ fontSize:13, color:"#888", marginTop:10, lineHeight:1.8 }}>
              We sent a link to<br/>
              <b style={{ color:"#1A1A2E" }}>{email}</b>
            </p>
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:16, margin:"18px 0", textAlign:"left" }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:8 }}>What to do next:</div>
              <div style={{ fontSize:13, color:"#555", lineHeight:1.9 }}>
                1. Open the email in your inbox<br/>
                2. Click the <b>Set your password</b> link<br/>
                3. Choose a password → you are in! ✅
              </div>
            </div>
            <button onClick={handleClose} className="btn btn-p" style={{ width:"100%" }}>Done</button>
          </div>
        ) : (
          /* ── Email entry screen ── */
          <>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:44 }}>👨‍👩‍👧‍👦</div>
              <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, marginTop:10, color:"#1A1A2E" }}>
                Join your family
              </h3>
              <p style={{ fontSize:13, color:"#888", marginTop:6, lineHeight:1.6 }}>
                Your invited email is pre-filled below. You can change it if needed.
              </p>
            </div>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>Your invited email</label>
            <input
              className="input"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              placeholder="email your Kitchen Head added"
              type="email"
              autoComplete="email"
              onKeyDown={e=>e.key==="Enter"&&handleSend()}
              style={{ marginBottom:16 }}
            />
            <button className="btn btn-p" onClick={handleSend} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
              {busy ? "Sending..." : "Send me a link to set my password"}
            </button>
          </>
        )}
      </div>

    </div>
  );
}

// ─── PASSWORD INPUT with show/hide toggle ────────────────────────────────────
function PwInput({ value, onChange, placeholder="Password", autoComplete="current-password" }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <input
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        style={{ paddingRight:44 }}
      />
      <button
        type="button"
        onClick={()=>setShow(s=>!s)}
        style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:17, padding:2, lineHeight:1, opacity:.6 }}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
const BG = "linear-gradient(150deg,#FFF8F0,#FFF0CC 60%,#FFF8F0)";

function LoginWrap({ children, title, sub, icon, langToggle }) {
  return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:430 }}>
        {/* Language toggle top right */}
        {langToggle && <div style={{ textAlign:"right", marginBottom:8 }}>{langToggle}</div>}
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <div style={{ fontSize: icon && icon.length > 2 ? 48 : 66 }}>{icon || "👨‍👩‍👧‍👦"}</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, color:"#1A1A2E", marginTop:8 }}>{title}</h1>
          {sub && <p style={{ color:"#999", fontSize:13, marginTop:5 }}>{sub}</p>}
        </div>
        {children}
        <div style={{ marginTop:14, background:"rgba(45,106,79,.08)", borderRadius:12, padding:"9px 14px", textAlign:"center" }}>
          <p style={{ fontSize:12, color:"#2D6A4F" }}>✅ Live — Designed by Revive Healthcare</p>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, showToast, autoInvite, autoInviteEmail="", onAutoInviteDone, lang="en", onLangChange }) {
  const t = T[lang] || T.en;
  const [step,      setStep]     = useState("auth");
  const [authMode,  setAuthMode] = useState("signin");
  const [busy,      setBusy]     = useState(false);
  const [username,  setUsername] = useState("");
  const [email,     setEmail]    = useState("");
  const [password,  setPassword] = useState("");
  const [confirmPw, setConfirmPw]= useState("");
  const [famMode,   setFamMode]  = useState("create");
  const [famName,   setFamName]  = useState("");
  const [famPw,     setFamPw]    = useState("");
  const [famId,     setFamId]    = useState("");
  const [authToken, setAuthToken]= useState(null);
  const [authUser,  setAuthUser] = useState(null);
  const [savedName, setSavedName]= useState("");
  const [fpEmail,   setFpEmail]  = useState("");
  const [fpNewPw,   setFpNewPw]  = useState("");
  const [fpConfirm, setFpConfirm]= useState("");
  const [fpToken,   setFpToken]  = useState(null);
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  // Auto-open popup if directed from invite link
  React.useEffect(() => {
    if (autoInvite) { setShowInvitePopup(true); if(onAutoInviteDone) onAutoInviteDone(); }
  }, [autoInvite]); // eslint-disable-line

  const handleAuth = async () => {
    if (!email.trim()) { showToast("Email is required","error"); return; }
    if (!password)     { showToast("Password is required","error"); return; }
    setBusy(true);
    try {
      if (authMode === "signin") {
        const { access_token, user } = await sbSignIn(email.trim().toLowerCase(), password);
        let mems = await sbGet("members", `auth_id=eq.${user.id}&select=*`);
        if (!mems?.length) {
          const byEmail = await sbGet("members", `email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=*`);
          if (byEmail?.length) {
            await sbPatch("members", `id=eq.${byEmail[0].id}`, { auth_id: user.id });
            mems = [{ ...byEmail[0], auth_id: user.id }];
          }
        }
        if (mems?.length) {
          onLogin(access_token, user, mems[0], mems[0].family_id);
        } else {
          setAuthToken(access_token); setAuthUser(user);
          setStep("family");
        }
      } else {
        if (!username.trim())       { showToast("Username is required","error"); setBusy(false); return; }
        if (password.length < 6)    { showToast("Password must be at least 6 characters","error"); setBusy(false); return; }
        if (password !== confirmPw) { showToast("Passwords do not match","error"); setBusy(false); return; }
        const emailLc = email.trim().toLowerCase();
        const { access_token, user } = await sbSignUp(emailLc, password);
        setSavedName(username.trim());
        setAuthToken(access_token); setAuthUser(user);
        // Check for pre-invite
        const preInvited = await sbGet("members", `email=eq.${encodeURIComponent(emailLc)}&select=*`);
        if (preInvited?.length) {
          const slot = preInvited[0];
          await sbPatch("members", `id=eq.${slot.id}`, { auth_id: user.id, username: username.trim(), name: username.trim() });
          const updated = { ...slot, auth_id: user.id, username: username.trim(), name: username.trim() };
          onLogin(access_token, user, updated, slot.family_id);
        } else {
          setStep("family");
        }
      }
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleFamily = async () => {
    setBusy(true);
    try {
      const displayName  = savedName || username.trim() || "Member";
      const memberEmail  = authUser?.email || email.trim().toLowerCase();
      if (famMode === "create") {
        if (!famPw) { showToast("Please set a family password","error"); setBusy(false); return; }
        const newFamId = "FAM-" + Math.random().toString(36).substr(2,6).toUpperCase();
        const [fam] = await sbPost("families", [{ id:newFamId, name:famName||`${displayName}'s Family`, password:famPw, head_id:null }]);
        const [mem] = await sbPost("members",  [{ auth_id:authUser.id, family_id:fam.id, name:displayName, username:displayName, email:memberEmail, role:"head" }]);
        await sbPatch("families", `id=eq.${fam.id}`, { head_id:mem.id });
        onLogin(authToken, authUser, mem, fam.id);
      } else {
        if (!famId || !famPw) { showToast("Family ID and password are required","error"); setBusy(false); return; }
        const fams = await sbGet("families", `id=eq.${famId.trim().toUpperCase()}&password=eq.${famPw}&select=*`);
        if (!fams?.length) { showToast("Family not found or wrong family password","error"); setBusy(false); return; }
        const [mem] = await sbPost("members", [{ auth_id:authUser.id, family_id:fams[0].id, name:displayName, username:displayName, email:memberEmail, role:"member" }]);
        onLogin(authToken, authUser, mem, fams[0].id);
      }
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleSendOTP = async () => {
    if (!fpEmail.trim()) { showToast("Please enter your email","error"); return; }
    setBusy(true);
    try {
      const _SB_URL = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
      const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
      const r = await fetch(`${_SB_URL}/functions/v1/send-invite`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${_SB_KEY}`, "apikey":_SB_KEY },
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase() })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Failed to send");
      showToast("Reset link sent! Check your inbox 📧");
      setStep("sent");
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  // ── FORGOT ────────────────────────────────────────────────────────────────
  if (step === "forgot") return (
    <LoginWrap title="Forgot Password" sub="Reset your password via email" icon="🔐">
      <div className="card" style={{ padding:24 }}>
        <button onClick={()=>setStep("auth")} style={{ background:"none", border:"none", color:"#aaa", cursor:"pointer", fontSize:13, marginBottom:16 }}>← Back to Sign In</button>
        <p style={{ fontSize:13, color:"#999", marginBottom:18 }}>Enter your registered email. We will send you a reset link.</p>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Registered Email</label>
          <input className="input" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" />
        </div>
        <button className="btn btn-p" onClick={handleSendOTP} disabled={busy} style={{ width:"100%", padding:12 }}>
          {busy ? "Sending..." : "📧 Send Reset Link"}
        </button>
      </div>
    </LoginWrap>
  );

  // ── SENT ──────────────────────────────────────────────────────────────────
  if (step === "sent") return (
    <LoginWrap title="Reset Link Sent" icon="📧">
      <div className="card" style={{ padding:28, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:16 }}>📬</div>
        <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#1A1A2E", marginBottom:10 }}>Check your inbox</h3>
        <p style={{ fontSize:14, color:"#555", lineHeight:1.7, marginBottom:6 }}>We sent a password reset link to</p>
        <p style={{ fontSize:15, fontWeight:700, color:"#1A1A2E", marginBottom:20 }}>{fpEmail}</p>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:16, marginBottom:24, textAlign:"left" }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:8 }}>What to do next:</div>
          <div style={{ fontSize:13, color:"#555", lineHeight:1.8 }}>
            1. Open the email from Supabase<br/>
            2. Click the <b>Reset Password</b> link<br/>
            3. You will be brought back here to set your new password
          </div>
        </div>
        <span style={{ fontSize:13, color:"#aaa" }}>Did not receive it? </span>
        <span style={{ fontSize:13, color:"#F4A200", cursor:"pointer", fontWeight:600 }} onClick={()=>{ setBusy(false); handleSendOTP(); }}>Resend link</span>
        <button onClick={()=>setStep("forgot")} style={{ display:"block", margin:"12px auto 0", background:"none", border:"none", color:"#bbb", fontSize:12, cursor:"pointer" }}>← Change email</button>
      </div>
    </LoginWrap>
  );

  // ── FAMILY SETUP ──────────────────────────────────────────────────────────
  if (step === "family") return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:430 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:52 }}>🏠</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#1A1A2E", marginTop:8 }}>Set Up Your Family</h2>
          <p style={{ color:"#999", fontSize:13, marginTop:5 }}>Hi {savedName||username||"there"}! Create a new group or join your family.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:18 }}>
          {[["create","🆕","Create Family","Start a new group"],["join","🔗","Join Family","Use an existing Family ID"]].map(([m,ic,l,sub])=>(
            <div key={m} onClick={()=>setFamMode(m)} style={{ background:"#fff", border:`2px solid ${famMode===m?"#F4A200":"#ede5d8"}`, borderRadius:14, padding:16, cursor:"pointer", textAlign:"center", transition:"all .18s" }}>
              <div style={{ fontSize:28 }}>{ic}</div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1A1A2E", marginTop:6 }}>{l}</div>
              <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding:22 }}>
          {famMode === "create" ? (
            <>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Name</label>
                <input className="input" value={famName} onChange={e=>setFamName(e.target.value)} placeholder={`${savedName||"Our"}'s Family`} />
              </div>
              <div style={{ marginBottom:6 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Password <span style={{ color:"#aaa", fontWeight:400 }}>(share with members)</span></label>
                <PwInput value={famPw} onChange={e=>setFamPw(e.target.value)} placeholder="e.g. sharma123" autoComplete="new-password" />
              </div>
              <p style={{ fontSize:11, color:"#aaa", marginBottom:16, marginTop:6 }}>You will be set as the Kitchen Head. Your Family ID is auto-generated.</p>
            </>
          ) : (
            <>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family ID</label>
                <input className="input" value={famId} onChange={e=>setFamId(e.target.value.toUpperCase())} placeholder="FAM-XXXXXX" />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Password</label>
                <PwInput value={famPw} onChange={e=>setFamPw(e.target.value)} placeholder="Ask your Kitchen Head" />
              </div>
            </>
          )}
          <button className="btn btn-p" onClick={handleFamily} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
            {busy ? "Please wait..." : famMode==="create" ? "Create My Family" : "Join Family"}
          </button>
        </div>
        <button onClick={()=>setStep("auth")} style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:"#aaa", fontSize:12, cursor:"pointer" }}>← Back to Sign In</button>
      </div>
    </div>
  );

  // ── AUTH (Sign In / Register) ─────────────────────────────────────────────
  return (
    <LoginWrap title={t.appName} sub={t.appTagline} langToggle={<LangToggle lang={lang} onChange={onLangChange} style={{ color:"#2D6A4F" }} />}>
      <InvitePopup show={showInvitePopup} initialEmail={autoInviteEmail} onClose={()=>setShowInvitePopup(false)} showToast={showToast} />
      <div className="card" style={{ padding:26 }}>
        {/* Tabs */}
        <div style={{ display:"flex", background:"#f5f0e8", borderRadius:10, padding:4, marginBottom:22, gap:2 }}>
          {[["signin","Sign In"],["register","Register"]].map(([m,l])=>(
            <button key={m} onClick={()=>{ setAuthMode(m); setPassword(""); setConfirmPw(""); }} style={{ flex:1, padding:"9px 4px", borderRadius:8, border:"none", background:authMode===m?"#fff":"transparent", fontWeight:authMode===m?700:400, fontSize:13, cursor:"pointer", color:authMode===m?"#1A1A2E":"#999", boxShadow:authMode===m?"0 1px 5px rgba(0,0,0,.08)":"none", transition:"all .18s" }}>{l}</button>
          ))}
        </div>

        {authMode === "register" && (
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.username} <span style={{ color:"#aaa", fontWeight:400 }}>{t.usernameSub}</span></label>
            <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. Amit" autoComplete="username" />
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.email}</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@gmail.com" type="email" autoComplete="email" />
        </div>
        <div style={{ marginBottom: authMode==="register" ? 14 : 6 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.password}</label>
          <PwInput value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==="register"?"Min. 6 characters":"Your password"} autoComplete={authMode==="register"?"new-password":"current-password"} />
        </div>
        {authMode === "register" && (
          <div style={{ marginBottom:6 }}>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.confirmPassword}</label>
            <PwInput value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
          </div>
        )}
        {authMode === "signin" && (
          <div style={{ textAlign:"right", marginBottom:16 }}>
            <span style={{ fontSize:12, color:"#F4A200", cursor:"pointer", fontWeight:600 }} onClick={()=>{ setFpEmail(email); setStep("forgot"); }}>{t.forgotPassword}</span>
          </div>
        )}

        <button className="btn btn-p" onClick={handleAuth} disabled={busy} style={{ width:"100%", padding:13, fontSize:15, marginTop: authMode==="register"?14:0 }}>
          {busy ? t.pleaseWait : authMode==="signin" ? t.signIn : t.createAccount}
        </button>

        <div style={{ textAlign:"center", marginTop:14, paddingTop:14, borderTop:"1px solid #f5f0e8" }}>
          <span style={{ fontSize:12, color:"#aaa" }}>Invited by a family member? </span>
          <span style={{ fontSize:12, color:"#2D6A4F", cursor:"pointer", fontWeight:600 }} onClick={()=>setShowInvitePopup(true)}>Get joining link</span>
        </div>
      </div>
    </LoginWrap>
  );
}


// ─── MEAL WEEK VIEW — shows one meal across all 7 days ───────────────────────
function MealWeekView({ meal, days, planner, foods, member, onBack, onAdd, getDayMealItems, MICONS, isHead, onToggle, onRemove, favs, toggleFav, usageCnt, onDayClick }) {
  const t    = useT();
  const lang = useLang();
  const nameHi = {};
  (foods||[]).forEach(f => { if(f.name_hi) nameHi[f.name] = f.name_hi; });
  const displayName = (n) => (lang==="hi" && nameHi[n]) ? nameHi[n] : n;
  const [expandedDay, setExpandedDay] = useState(null);
  const mealFoods = foods.filter(f => (Array.isArray(f.categories)?f.categories:[f.category].filter(Boolean)).includes(meal));
  const sortedFoods = [...mealFoods].sort((a,b) => {
    const af=favs[a.id]?1:0, bf=favs[b.id]?1:0;
    if (bf!==af) return bf-af;
    const au=usageCnt[a.name]||0, bu=usageCnt[b.name]||0;
    if (bu!==au) return bu-au;
    return a.name.localeCompare(b.name);
  });

  const [search, setSearch] = useState("");
  const filtered = search ? sortedFoods.filter(f=>f.name.toLowerCase().includes(search.toLowerCase())) : sortedFoods;
  const [previewFood, setPreviewFood] = useState(null);

  return (
    <div>
      {previewFood && <FoodPreviewModal food={previewFood} onClose={()=>setPreviewFood(null)} />}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← Dashboard</button>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{MICONS[meal]} {t.mealShort[meal]||meal} — {lang==="hi"?"पूरे सप्ताह":"All Week"}</h2>
          <p style={{ fontSize:12, color:"#999", marginTop:2 }}>View and add {meal.toLowerCase()} for each day</p>
        </div>
      </div>

      {/* Week grid — one card per day */}
      <div style={{ display:"grid", gap:10, marginBottom:22 }}>
        {days.map(day => {
          const items = getDayMealItems(day, meal);
          const isToday = day === new Date().toLocaleDateString("en",{weekday:"long"});
          const isOpen  = expandedDay === day;
          return (
            <div key={day} className="card" style={{ border: isToday?"2px solid #F4A200":"1px solid #ede5d8" }}>
              {/* Day header — click to expand food picker */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={()=>setExpandedDay(isOpen?null:day)}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {isToday && <span style={{ background:"#F4A200", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>TODAY</span>}
                  <span className="serif" style={{ fontSize:16, fontWeight:700, color:"#1A1A2E" }}>{t.days[day]||day}</span>
                  {items.length>0 && <span style={{ background:"#fff8e1", color:"#a87800", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>{items.length} selected</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {items.length===0 && <span style={{ fontSize:12, color:"#ccc" }}>+ Add</span>}
                  <span style={{ color:"#F4A200", fontSize:18, transform:isOpen?"rotate(90deg)":"none", transition:"transform .2s" }}>›</span>
                </div>
              </div>

              {/* Current selections for this day */}
              {items.length>0 && (
                <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {items.map(item=>(
                    <div key={item.id} style={{ display:"flex", alignItems:"center", gap:5, background:item.finalized?"#e8f5e9":"#f5f5f5", border:`1px solid ${item.finalized?"#c8e6c9":"#eee"}`, borderRadius:20, padding:"4px 10px", fontSize:12, cursor:"pointer" }}
                      onClick={e=>{ e.stopPropagation(); const f=foods.find(fd=>fd.name===item.food_name); if(f) setPreviewFood(f); }}>
                      <span>{item.food_emoji} {displayName(item.food_name)}</span>
                      <span style={{ color:"#aaa", fontSize:10 }}>— {item.member_name}</span>
                      {item.member_name===member?.name && (
                        <button onClick={e=>{e.stopPropagation();onRemove(item.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:14, padding:"0 2px", lineHeight:1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Expandable food picker */}
              {isOpen && (
                <div style={{ marginTop:14, borderTop:"1px solid #f0e8d8", paddingTop:14 }}>
                  <div style={{ position:"relative", marginBottom:12 }}>
                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#bbb" }}>🔍</span>
                    <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${meal} items...`} style={{ paddingLeft:32, paddingRight:search?32:12 }} />
                    {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:16 }}>×</button>}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
                    {filtered.slice(0,12).map(food=>(
                      <div key={food.id||food.name} className="food-card" style={{ padding:10, position:"relative", cursor:"pointer" }} onClick={()=>setPreviewFood(food)}>
                        <button onClick={e=>{e.stopPropagation();toggleFav(food.id);}} style={{ position:"absolute", top:5, right:5, background:"none", border:"none", cursor:"pointer", fontSize:13 }}>
                          {favs[food.id]?"❤️":"🤍"}
                        </button>
                        <div style={{ fontSize:32, textAlign:"center", marginBottom:5 }}>{food.emoji}</div>
                        <div style={{ fontWeight:600, fontSize:12, textAlign:"center", marginBottom:2 }}>{(lang==="hi"&&food.name_hi)||food.name}</div>
                        <div style={{ fontSize:10, color:"#aaa", textAlign:"center", marginBottom:7 }}>{food.calories} kcal</div>
                        <button className="btn btn-p btn-sm" style={{ width:"100%", fontSize:11, padding:"5px" }} onClick={e=>{e.stopPropagation();onAdd(day,meal,food);}}>+ Add</button>
                      </div>
                    ))}
                    {filtered.length===0 && <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#ccc", padding:20, fontSize:13 }}>No results for "{search}"</div>}
                  </div>
                  {filtered.length>12 && (
                    <div style={{ textAlign:"center", marginTop:10 }}>
                      <button className="btn btn-g btn-sm" onClick={()=>onDayClick(day)}>See all {filtered.length} items →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({ days, meals, planner, getMealSummary, onDayClick, onMealViewClick, MICONS, MCOLS, showInstallBanner, onInstall, member, family, members, setMembers, setFamily, showToast, foods }) {
  const t    = useT();
  const lang = useLang();
  const [previewFood, setPreviewFood] = useState(null);
  const now = new Date();
  const today = now.toLocaleDateString("en",{weekday:"long"});
  const totalWeek = planner.length;
  const finalizedCount = planner.filter(p=>p.finalized).length;

  // Re-order days starting from today, and compute actual dates for each
  const todayIdx = days.indexOf(today);
  const orderedDays = todayIdx >= 0
    ? [...days.slice(todayIdx), ...days.slice(0, todayIdx)]
    : days;

  // Map each day name to its actual calendar date
  const dayDates = {};
  orderedDays.forEach((day, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dayDates[day] = d;
  });

  const fmtDate = (d) => d.toLocaleDateString("en-IN", { day:"numeric", month:"short" });

  return (
    <div>
      {previewFood && <FoodPreviewModal food={previewFood} onClose={()=>setPreviewFood(null)} />}
      {/* Head Transfer Banner — shown to invited member on dashboard */}
      <HeadTransferBanner
        member={member} family={family} members={members}
        setMembers={setMembers} setFamily={setFamily}
        showToast={showToast}
        onHeadChange={()=>window.location.reload()}
      />
      <div style={{ marginBottom:20 }}>
        <h2 className="serif" style={{ fontSize:26, color:"#1A1A2E" }}>{t.weeklyMealPlanner}</h2>
        <p style={{ color:"#999", fontSize:13, marginTop:4 }}>{totalWeek} {t.selectionsThisWeek} · {finalizedCount} {t.finalized}</p>
      </div>
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{ background:"linear-gradient(135deg,#2D6A4F,#1a4a35)", borderRadius:14, padding:"14px 18px", marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>📲 Add to Home Screen</div>
            <div style={{ color:"rgba(255,255,255,.75)", fontSize:12, marginTop:3 }}>Access Family Kitchen like an app — no browser needed</div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            <button onClick={onInstall} style={{ background:"#F4A200", color:"#fff", border:"none", padding:"8px 16px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer" }}>Install</button>
            <button onClick={()=>onInstall && document.querySelector(".install-banner")?.remove()} style={{ background:"rgba(255,255,255,.15)", color:"#fff", border:"none", padding:"8px 10px", borderRadius:9, fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        </div>
      )}
      {/* week summary strip — always 4 cols, slim for mobile */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:18 }}>
        {meals.map(m=>{
          const c = planner.filter(p=>p.meal===m).length;
          return <div key={m} className="card-hover" onClick={()=>onMealViewClick(m)} style={{ background:"#fff", borderRadius:10, padding:"8px 4px", border:"1px solid #ede5d8", textAlign:"center", cursor:"pointer" }}>
            <div style={{ fontSize:18 }}>{MICONS[m]}</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1A1A2E", marginTop:2, lineHeight:1 }}>{c}</div>
            <div style={{ fontSize:10, color:"#999", marginTop:2, lineHeight:1.2 }}>{t.mealShort[m]||m}</div>
            <div style={{ fontSize:9, color:"#F4A200", marginTop:3, fontWeight:600 }}>View →</div>
          </div>;
        })}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px,1fr))", gap:14 }}>
        {orderedDays.map(day=>{
          const isToday   = day===today;
          const dateObj   = dayDates[day];
          const isTomorrow= dateObj && (dateObj.getDate() - now.getDate() === 1 && dateObj.getMonth()===now.getMonth());
          const total     = meals.reduce((a,m)=>a+(planner.filter(p=>p.day===day&&p.meal===m).length),0);
          const finCount  = planner.filter(p=>p.day===day&&p.finalized).length;

          // ── Shared meal-rows renderer for Today + Tomorrow ──────────────────
          const openPreview = (foodName) => {
            const f = (foods||[]).find(fd=>fd.name===foodName);
            if (f) setPreviewFood(f);
          };
          const mealRows = (
            <>
              {meals.map(meal=>{
                const items    = planner.filter(p=>p.day===day&&p.meal===meal);
                const finItems = items.filter(p=>p.finalized);
                const pendItems= items.filter(p=>!p.finalized);
                return (
                  <div key={meal} style={{ padding:"5px 0", borderBottom:"1px solid #f5f0e8" }}>
                    <div style={{ fontSize:11, color:"#888", marginBottom: items.length>0 ? 4 : 0 }}>{MICONS[meal]} {t.mealShort[meal]||meal}</div>
                    {items.length>0 ? (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                        {finItems.map(item=>(
                          <span key={item.id} onClick={e=>{e.stopPropagation();openPreview(item.food_name);}}
                            style={{ background:"#e8f5e9", color:"#2D6A4F", fontSize:11, fontWeight:600, padding:"2px 9px", borderRadius:20, cursor:"pointer" }}>✓ {item.food_name}</span>
                        ))}
                        {pendItems.map(item=>(
                          <span key={item.id} onClick={e=>{e.stopPropagation();openPreview(item.food_name);}}
                            style={{ background:"#fff8e1", color:"#a87800", fontSize:11, fontWeight:600, padding:"2px 9px", borderRadius:20, cursor:"pointer" }}>{item.food_name}</span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ background:"#f5f5f5", color:"#ccc", fontSize:11, padding:"2px 8px", borderRadius:20 }}>{lang==="hi"?"— नहीं चुना":"— not set"}</span>
                    )}
                  </div>
                );
              })}
            </>
          );

          // ── TODAY card ───────────────────────────────────────────────────────
          if (isToday) return (
            <div key={day} className="card card-hover" onClick={()=>onDayClick(day)}
              style={{ border:"2px solid #F4A200", position:"relative", overflow:"hidden",
                gridColumn:"span 1",
                // On wider screens Today+Tomorrow share first row (each span 1)
              }}>
              <div style={{ position:"absolute", top:0, right:0, background:"#F4A200", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:"0 0 0 8px" }}>{t.today}</div>
              <div style={{ marginBottom:10, paddingRight:50 }}>
                <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>{t.days[day]||day}</div>
                {dateObj && <div style={{ fontSize:11, color:"#F4A200", fontWeight:700, marginTop:2 }}>{fmtDate(dateObj)}</div>}
              </div>
              {mealRows}
            </div>
          );

          // ── TOMORROW card ────────────────────────────────────────────────────
          if (isTomorrow) return (
            <div key={day} className="card card-hover" onClick={()=>onDayClick(day)}
              style={{ border:"1.5px solid #2D6A4F", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, right:0, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:"0 0 0 8px" }}>{t.tomorrow}</div>
              <div style={{ marginBottom:10, paddingRight:60 }}>
                <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>{t.days[day]||day}</div>
                {dateObj && <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{fmtDate(dateObj)}</div>}
              </div>
              {mealRows}
            </div>
          );

          // ── OTHER days ───────────────────────────────────────────────────────
          return (
            <div key={day} className="card card-hover" onClick={()=>onDayClick(day)}
              style={{ border:"1px solid #ede5d8", position:"relative", overflow:"hidden" }}>
              <div style={{ marginBottom:8 }}>
                <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>{t.days[day]||day}</div>
                {dateObj && <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{fmtDate(dateObj)}</div>}
              </div>
              {meals.map(meal=>{
                const items = planner.filter(p=>p.day===day&&p.meal===meal);
                return <div key={meal} className="meal-row">
                  <span style={{ fontSize:12, color:"#888" }}>{MICONS[meal]} {t.mealShort[meal]||meal}</span>
                  <span style={{ fontSize:11, background:items.length>0?"#fff8e1":"#f5f5f5", color:items.length>0?"#a87800":"#ccc", padding:"2px 7px", borderRadius:20, fontWeight:700 }}>{items.length||"—"}</span>
                </div>;
              })}
              {total>0 && <div style={{ marginTop:8, fontSize:11, color:"#2D6A4F", fontWeight:500 }}>📋 {total} {lang==="hi"?"आइटम":"items"} · {finCount} ✓</div>}
            </div>
          );

        })}
      </div>
    </div>
  );
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────
function DayView({ day, meals, planner, getMealSummary, onBack, onMealClick, MICONS, MCOLS, isHead, onToggle, onRemove, member }) {
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← Week</button>
        <div><h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{day}</h2><p style={{ fontSize:12, color:"#999" }}>Tap a meal to view or add items</p></div>
      </div>
      <div style={{ display:"grid", gap:14 }}>
        {meals.map(meal=>{
          const summary = getMealSummary(day, meal);
          const items = planner.filter(p=>p.day===day&&p.meal===meal);
          const mems = Object.keys(summary);
          return (
            <div key={meal} className="card" style={{ cursor:"pointer" }} onClick={()=>onMealClick(meal)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:mems.length?12:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:30 }}>{MICONS[meal]}</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:16, color:"#1A1A2E" }}>{meal}</div>
                    <div style={{ fontSize:12, color:"#999" }}>{items.length} item{items.length!==1?"s":""} selected</div>
                  </div>
                </div>
                <span style={{ color:"#F4A200", fontSize:22, marginTop:2 }}>›</span>
              </div>
              {mems.length>0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {mems.map((mem,mi)=>(
                    <div key={mem} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:MCOLS[mi%MCOLS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>{mem[0]}</div>
                      <div style={{ flex:1, fontSize:13, color:"#555" }}><b style={{ color:"#333" }}>{mem}:</b> {summary[mem].join(", ")}</div>
                    </div>
                  ))}
                </div>
              )}
              {mems.length===0 && <div style={{ color:"#ccc", fontSize:12, textAlign:"center", padding:"8px 0" }}>+ Tap to add meals</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MEAL VIEW ────────────────────────────────────────────────────────────────
function MealView({ day, meal, foods, member, onBack, onAdd, getMealSummary, getDayMealItems, MICONS, isHead, onToggle, onRemove, favs, toggleFav, usageCnt }) {
  const t = useT();
  const lang = useLang();
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = React.useRef();
  const [previewFood, setPreviewFood] = useState(null);

  const mealFoods = foods.filter(f => (Array.isArray(f.categories)?f.categories:[f.category].filter(Boolean)).includes(meal));
  const currentItems = getDayMealItems(day, meal);
  const summary = getMealSummary(day, meal);

  // Sort: favourites first → then by usage count → then alpha
  const sortedFoods = [...mealFoods].sort((a,b) => {
    const af = favs[a.id]?1:0, bf = favs[b.id]?1:0;
    if (bf!==af) return bf-af;
    const au = usageCnt[a.name]||0, bu = usageCnt[b.name]||0;
    if (bu!==au) return bu-au;
    return a.name.localeCompare(b.name);
  });

  const filtered = search.trim()
    ? sortedFoods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || (f.ingredients||[]).some(i=>i.toLowerCase().includes(search.toLowerCase())))
    : sortedFoods;

  const favFoods  = filtered.filter(f => favs[f.id]);
  const otherFoods= filtered.filter(f => !favs[f.id]);

  // Detail view
  if (detail) return (
    <div>
      <button className="btn btn-g btn-sm" onClick={()=>setDetail(null)} style={{ marginBottom:16 }}>← Back to {meal}</button>
      <div className="card">
        {/* Fav toggle on detail */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
          <button onClick={()=>toggleFav(detail.id)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:24 }} title={favs[detail.id]?"Remove from favourites":"Add to favourites"}>
            {favs[detail.id] ? "❤️" : "🤍"}
          </button>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:140, height:140, borderRadius:16, overflow:"hidden", margin:"0 auto 12px", background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <FoodImage food={detail} size={140} radius={16} />
          </div>
          <h2 className="serif" style={{ fontSize:24, marginTop:8 }}>{(lang==="hi"&&detail.name_hi)||detail.name}</h2>
          <p style={{ color:"#999", fontSize:13, marginTop:4 }}>📏 Portion: <b style={{ color:"#555" }}>{detail.portion}</b></p>
          {usageCnt[detail.name]>0 && <p style={{ color:"#2D6A4F", fontSize:12, marginTop:4 }}>✓ Added {usageCnt[detail.name]} time{usageCnt[detail.name]!==1?"s":""} this week</p>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, margin:"18px 0" }}>
          {[["Calories",detail.calories,"kcal","#F4A200"],["Protein",detail.protein,"g","#2D6A4F"],["Carbs",detail.carbs,"g","#6B5CE7"],["Fat",detail.fat,"g","#C1440E"],["Fiber",detail.fiber,"g","#00BCD4"]].map(([k,v,u,c])=>(
            <div key={k} className="nut-pill" style={{ background:"#f9f9f9", borderTop:`3px solid ${c}` }}>
              <div style={{ fontSize:15, fontWeight:700, color:c }}>{v}{u}</div>
              <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{k}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontWeight:600, color:"#1A1A2E", marginBottom:8, fontSize:14 }}>🛒 Ingredients</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{(detail.ingredients||[]).map((ing,i)=><span key={i} className="tag">{ing}</span>)}</div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontWeight:600, color:"#1A1A2E", marginBottom:8, fontSize:14 }}>👨‍🍳 Recipe</div>
          <p style={{ fontSize:13, color:"#555", lineHeight:1.75 }}>{detail.recipe}</p>
        </div>
        {detail.youtube && <a href={detail.youtube} target="_blank" rel="noreferrer" style={{ display:"block", background:"#ff0000", color:"#fff", textAlign:"center", padding:11, borderRadius:10, textDecoration:"none", fontWeight:700, fontSize:14, marginBottom:10 }}>▶ Watch on YouTube</a>}
        <button className="btn btn-p" onClick={()=>{ onAdd(day, meal, detail); setDetail(null); }} style={{ width:"100%" }}>+ Add to {day}'s {meal}</button>
      </div>
    </div>
  );

  const FoodCard = ({ food }) => {
    const isFav = favs[food.id];
    const usage = usageCnt[food.name]||0;
    return (
      <div className="food-card" style={{ position:"relative" }}>
        {/* Fav heart */}
        <button onClick={e=>{ e.stopPropagation(); toggleFav(food.id); }}
          style={{ position:"absolute", top:6, right:6, background:"rgba(255,255,255,.85)", border:"none", cursor:"pointer", fontSize:16, borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}>
          {isFav ? "❤️" : "🤍"}
        </button>
        {usage>0 && <div style={{ position:"absolute", top:6, left:6, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10, zIndex:2 }}>×{usage}</div>}
        <div style={{ width:"100%", height:90, borderRadius:10, overflow:"hidden", marginBottom:8, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <FoodImage food={food} size={80} radius={0} />
        </div>
        <div style={{ fontWeight:600, textAlign:"center", fontSize:14, marginBottom:3 }}>{(lang==="hi"&&food.name_hi)||food.name}</div>
        <div style={{ fontSize:11, color:"#aaa", textAlign:"center", marginBottom:9 }}>{food.portion}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:10 }}>
          <div style={{ background:"#fff8e1", borderRadius:7, padding:"5px 3px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:"#a87800" }}>{food.calories}</div><div style={{ fontSize:9, color:"#cca000" }}>kcal</div></div>
          <div style={{ background:"#e8f5e9", borderRadius:7, padding:"5px 3px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:"#2D6A4F" }}>{food.protein}g</div><div style={{ fontSize:9, color:"#4caf50" }}>protein</div></div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button className="btn btn-g btn-sm" onClick={()=>setPreviewFood(food)} style={{ flex:1 }}>Info</button>
          <button className="btn btn-p btn-sm" onClick={()=>onAdd(day,meal,food)} style={{ flex:1 }}>+ Add</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {previewFood && <FoodPreviewModal food={previewFood} onClose={()=>setPreviewFood(null)} />}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← {day}</button>
        <div><h2 className="serif" style={{ fontSize:20, color:"#1A1A2E" }}>{MICONS[meal]} {meal} — {day}</h2></div>
      </div>

      {currentItems.length>0 && (
        <div className="card" style={{ marginBottom:14, background:"#fffdf7" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#a87800", marginBottom:8 }}>📋 Current Selections</div>
          {currentItems.map(item=>(
            <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid #f5f0e8" }}>
              <span style={{ fontSize:13 }}>{item.food_emoji} <b>{item.food_name}</b> <span style={{ color:"#aaa", fontSize:11 }}>— {item.member_name}</span>{item.finalized&&<span style={{ color:"#2D6A4F", fontSize:11 }}> ✓</span>}</span>
              {item.member_name===member?.name && <button onClick={e=>{e.stopPropagation();onRemove(item.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:16, padding:"0 4px" }}>✕</button>}
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div style={{ position:"relative", marginBottom:16 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, color:"#bbb" }}>🔍</span>
        <input
          ref={searchRef}
          className="input"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder={`Search ${meal} items or ingredients…`}
          style={{ paddingLeft:38, paddingRight: search?36:14 }}
        />
        {search && <button onClick={()=>{ setSearch(""); searchRef.current?.focus(); }} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:18 }}>✕</button>}
      </div>

      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:40, color:"#ccc" }}>
          <div style={{ fontSize:40 }}>🔍</div>
          <div style={{ marginTop:10 }}>No results for "{search}"</div>
        </div>
      )}

      {/* Favourites section */}
      {favFoods.length>0 && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:14 }}>❤️</span>
            <h3 style={{ fontSize:13, fontWeight:700, color:"#C1440E", textTransform:"uppercase", letterSpacing:.5 }}>Favourites</h3>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:13, marginBottom:20 }}>
            {favFoods.map(food=><FoodCard key={food.id||food.name} food={food} />)}
          </div>
        </>
      )}

      {/* All / remaining items */}
      {otherFoods.length>0 && (
        <>
          {favFoods.length>0 && <h3 style={{ fontSize:13, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>All Items</h3>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:13 }}>
            {otherFoods.map(food=><FoodCard key={food.id||food.name} food={food} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── FOOD IMAGE — shows photo if available, else emoji ───────────────────────
function FoodImage({ food, size=48, radius=8 }) {
  if (food.photo_url) return (
    <img src={food.photo_url} alt={food.name}
      style={{ width:size, height:size, objectFit:"cover", borderRadius:radius, display:"block" }} />
  );
  return <div style={{ fontSize:size*0.65, textAlign:"center", lineHeight:1, width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center" }}>{food.emoji||"🍽️"}</div>;
}


// ─── FOOD DATABASE ─────────────────────────────────────────────────────────────
function FoodPreviewModal({ food, onClose }) {
  const lang = useLang();
  if (!food) return null;

  const printFoodCard = () => {
    const isHindi = lang === "hi";
    const name    = (isHindi && food.name_hi) ? food.name_hi : food.name;
    const nameEn  = (isHindi && food.name_hi) ? food.name : "";
    const cats    = (Array.isArray(food.categories) ? food.categories : [food.category]).filter(Boolean);
    const ings    = food.ingredients ? (Array.isArray(food.ingredients) ? food.ingredients : food.ingredients.split("\n")).filter(Boolean) : [];

    const nutRows = [
      ["🔥", isHindi?"कैलोरी":"Calories", food.calories, "kcal", "#FFF8E1", "#F4A200"],
      ["💪", isHindi?"प्रोटीन":"Protein",  food.protein,  "g",    "#E8F5E9", "#2D6A4F"],
      ["🌾", isHindi?"कार्ब्स":"Carbs",    food.carbs,    "g",    "#E3F2FD", "#1565C0"],
      ["🧈", isHindi?"वसा":"Fat",           food.fat,      "g",    "#FCE4EC", "#C62828"],
    ];

    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>${name} — Family Kitchen</title>
<style>
  @page { size:A4 portrait; margin:12mm; }
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  body { font-family:Arial,'Noto Sans Devanagari',sans-serif; color:#1A1A2E; background:#fff; }

  /* Header */
  .hdr { background:linear-gradient(135deg,#1A1A2E,#2D6A4F)!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff; padding:14px 20px; border-radius:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; }
  .hdr-title { font-size:18px; font-weight:900; color:#F4A200!important; }
  .hdr-sub { font-size:11px; opacity:.75; margin-top:3px; }
  .hdr-right { font-size:11px; opacity:.7; text-align:right; }

  /* Food hero */
  .hero { display:flex; gap:18px; align-items:flex-start; margin-bottom:14px; }
  .hero-img { width:140px; height:140px; border-radius:12px; background:linear-gradient(135deg,#FFF8F0,#FFF0CC)!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; display:flex; align-items:center; justify-content:center; font-size:70px; flex-shrink:0; overflow:hidden; border:1px solid #ede5d8; }
  .hero-img img { width:100%; height:100%; object-fit:cover; }
  .hero-info { flex:1; }
  .food-name { font-size:26px; font-weight:900; color:#1A1A2E; line-height:1.2; margin-bottom:4px; }
  .food-name-en { font-size:13px; color:#aaa; margin-bottom:8px; }
  .cats { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
  .cat { background:#F5F0E8!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#a87800; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
  .portion { background:#F0FDF4!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#2D6A4F; font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px; }

  /* Nutrition grid */
  .nut-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
  .nut-cell { border-radius:10px; padding:10px 6px; text-align:center; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .nut-icon { font-size:18px; }
  .nut-val { font-size:18px; font-weight:900; margin-top:3px; }
  .nut-unit { font-size:9px; opacity:.8; }
  .nut-lbl { font-size:9px; color:#888; margin-top:2px; }
  .fiber { background:#F3E5F5!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#7B1FA2; font-size:12px; padding:5px 12px; border-radius:8px; display:inline-block; margin-bottom:12px; }

  /* Section headings */
  .sec { font-size:14px; font-weight:800; color:#1A1A2E; margin-bottom:8px; border-left:4px solid #F4A200; padding-left:8px; }

  /* Ingredients */
  .ing-wrap { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
  .ing { background:#F9F5EF!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; border:1px solid #EDE5D8; border-radius:20px; padding:4px 10px; font-size:12px; color:#555; }

  /* Recipe */
  .recipe { background:#FFFDF7!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; border:1px solid #F5ECD8; border-radius:10px; padding:14px; font-size:13px; color:#555; line-height:1.8; white-space:pre-wrap; margin-bottom:14px; }

  /* Footer */
  .ftr { margin-top:14px; background:#1A1A2E!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; border-radius:8px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; }
  .ftr-l { font-size:11px; color:rgba(255,255,255,.6)!important; }
  .ftr-r { font-size:11px; color:#F4A200!important; font-weight:700; }

  .print-btn { background:#F4A200!important; color:#fff!important; border:none; padding:9px 22px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:800; margin-bottom:14px; }
  @media print { .no-print { display:none!important; } }
</style>
</head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ ${isHindi?"प्रिंट करें":"Print"}</button>

<!-- Header -->
<div class="hdr">
  <div>
    <div class="hdr-title">👨‍👩‍👧‍👦 Family Kitchen</div>
    <div class="hdr-sub">फैमिली किचन · Designed by Revive Healthcare</div>
  </div>
  <div class="hdr-right">${new Date().toLocaleDateString(isHindi?"hi-IN":"en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
</div>

<!-- Hero -->
<div class="hero">
  <div class="hero-img">
    ${food.photo_url ? `<img src="${food.photo_url}" alt="${name}"/>` : `<span>${food.emoji||"🍽️"}</span>`}
  </div>
  <div class="hero-info">
    <div class="food-name">${name}</div>
    ${nameEn ? `<div class="food-name-en">${nameEn}</div>` : ""}
    <div class="cats">
      ${cats.map(c=>`<span class="cat">${c}</span>`).join("")}
      ${food.portion ? `<span class="portion">📏 ${food.portion}</span>` : ""}
    </div>
    <!-- Nutrition -->
    <div class="nut-grid">
      ${nutRows.map(([ic,lbl,val,unit,bg,col])=>`
        <div class="nut-cell" style="background:${bg}!important;">
          <div class="nut-icon">${ic}</div>
          <div class="nut-val" style="color:${col}!important;">${val||0}</div>
          <div class="nut-unit" style="color:${col}!important;">${unit}</div>
          <div class="nut-lbl">${lbl}</div>
        </div>`).join("")}
    </div>
    ${food.fiber ? `<div class="fiber">🌿 ${isHindi?"फाइबर":"Fiber"}: <b>${food.fiber}g</b></div>` : ""}
  </div>
</div>

${ings.length > 0 ? `
<div class="sec">🧾 ${isHindi?"सामग्री":"Ingredients"}</div>
<div class="ing-wrap">${ings.map(i=>`<span class="ing">${i}</span>`).join("")}</div>` : ""}

${food.recipe ? `
<div class="sec">👨‍🍳 ${isHindi?"बनाने की विधि":"Recipe"}</div>
<div class="recipe">${food.recipe}</div>` : ""}

${food.youtube ? `<div style="font-size:12px;color:#aaa;margin-bottom:12px;">▶️ ${isHindi?"यूट्यूब":"YouTube"}: <span style="color:#1565C0;">${food.youtube}</span></div>` : ""}

<!-- Footer -->
<div class="ftr">
  <span class="ftr-l">Family Kitchen — ${isHindi?"फैमिली किचन रेसिपी कार्ड":"Recipe Card"}</span>
  <span class="ftr-r">✅ Revive Healthcare · ${new Date().getFullYear()}</span>
</div>

<script>window.addEventListener('load',function(){ var b=document.body; var s=Math.min((window.innerWidth-20)/b.scrollWidth,(window.innerHeight-20)/b.scrollHeight,1); if(s<1){ b.style.transform='scale('+s+')'; b.style.transformOrigin='top left'; } }); window.addEventListener('beforeprint',function(){ document.body.style.transform='none'; });</script>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", position:"relative" }}>
        {/* Hero */}
        <div style={{ width:"100%", height:200, background:"linear-gradient(135deg,#FFF8F0,#FFF0CC)", borderRadius:"20px 20px 0 0", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
          {food.photo_url
            ? <img src={food.photo_url} alt={food.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <span style={{ fontSize:80 }}>{food.emoji||"🍽️"}</span>}
          <button onClick={onClose} style={{ position:"absolute", top:12, right:12, background:"rgba(0,0,0,.4)", border:"none", borderRadius:"50%", width:32, height:32, color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ padding:20 }}>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, color:"#1A1A2E", margin:"0 0 4px" }}>{(lang==="hi"&&food.name_hi)||food.name}</h2>
          {lang==="hi" && food.name_hi && <p style={{ fontSize:13, color:"#aaa", margin:"0 0 8px" }}>{food.name}</p>}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
            {(Array.isArray(food.categories)?food.categories:[food.category]).filter(Boolean).map(c=>(
              <span key={c} style={{ background:"#f5f0e8", color:"#a87800", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>{c}</span>
            ))}
            {food.portion && <span style={{ background:"#f0fdf4", color:"#2D6A4F", fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20 }}>📏 {food.portion}</span>}
          </div>
          {/* Nutrition grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
            {[["🔥","Calories",food.calories,"kcal","#fff8e1","#a87800"],
              ["💪","Protein",food.protein,"g","#e8f5e9","#2D6A4F"],
              ["🌾","Carbs",food.carbs,"g","#e3f2fd","#1565c0"],
              ["🧈","Fat",food.fat,"g","#fce4ec","#c62828"]
            ].map(([ic,lbl,val,unit,bg,col])=>(
              <div key={lbl} style={{ background:bg, borderRadius:10, padding:"10px 4px", textAlign:"center" }}>
                <div style={{ fontSize:16 }}>{ic}</div>
                <div style={{ fontSize:16, fontWeight:700, color:col }}>{val||0}</div>
                <div style={{ fontSize:9, color:col, opacity:.8 }}>{unit}</div>
                <div style={{ fontSize:9, color:"#888", marginTop:1 }}>{lbl}</div>
              </div>
            ))}
          </div>
          {!!food.fiber && <div style={{ background:"#f3e5f5", borderRadius:8, padding:"6px 12px", fontSize:12, color:"#7b1fa2", marginBottom:14, display:"inline-block" }}>🌿 Fiber: <b>{food.fiber}g</b></div>}
          {/* Ingredients */}
          {food.ingredients?.length>0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"#1A1A2E", marginBottom:8 }}>🧾 {lang==="hi"?"सामग्री":"Ingredients"}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {(Array.isArray(food.ingredients)?food.ingredients:food.ingredients.split("\n")).filter(Boolean).map((ing,idx)=>(
                  <span key={idx} style={{ background:"#f9f5ef", border:"1px solid #ede5d8", borderRadius:20, padding:"4px 10px", fontSize:12, color:"#555" }}>{ing}</span>
                ))}
              </div>
            </div>
          )}
          {/* Recipe */}
          {food.recipe && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#1A1A2E" }}>👨‍🍳 {lang==="hi"?"बनाने की विधि":"Recipe"}</div>
                <a href={`https://translate.google.com/m?sl=auto&tl=${lang==="hi"?"hi":"en"}&q=${encodeURIComponent(food.recipe)}`}
                  target="_blank" rel="noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#4285F4", color:"#fff", padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:700, textDecoration:"none", flexShrink:0 }}>
                  <span style={{ fontSize:13 }}>🌐</span> {lang==="hi"?"अनुवाद करें":"Translate"}
                </a>
              </div>
              <div style={{ background:"#fffdf7", border:"1px solid #f5ecd8", borderRadius:10, padding:14, fontSize:13, color:"#555", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{food.recipe}</div>
            </div>
          )}
          {/* YouTube */}
          {food.youtube && (
            <a href={food.youtube} target="_blank" rel="noreferrer"
              style={{ display:"flex", alignItems:"center", gap:10, background:"#ff0000", color:"#fff", padding:"12px 16px", borderRadius:12, textDecoration:"none", fontWeight:700, fontSize:14, marginBottom:12 }}>
              <span style={{ fontSize:22 }}>▶️</span>
              <span>{lang==="hi"?"यूट्यूब पर देखें":"Watch on YouTube"}</span>
            </a>
          )}
          {/* Print button */}
          <button onClick={printFoodCard}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"#1A1A2E", color:"#fff", border:"none", padding:"12px", borderRadius:12, fontWeight:700, fontSize:14, cursor:"pointer" }}>
            🖨️ {lang==="hi"?"रेसिपी कार्ड प्रिंट करें":"Print Recipe Card"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FoodsView({ foods, setFoods, showToast, MEALS, favs, toggleFav, usageCnt }) {
  const t = useT();
  const lang = useLang();
  const [cat,          setCat]         = useState("All");
  const [form,         setForm]        = useState(null);
  const [busy,         setBusy]        = useState(false);
  const [photoPreview, setPhotoPreview]= useState(null);
  const [search,       setSearch]      = useState("");
  const [importMode,   setImportMode]  = useState(null);
  const [aiInput,      setAiInput]     = useState("");
  const [aiBusy,       setAiBusy]      = useState(false);
  const [aiPreview,    setAiPreview]   = useState([]);
  const [previewFood,  setPreviewFood] = useState(null);
  const fileRef  = React.useRef();
  const csvRef   = React.useRef();
  const searchRef= React.useRef();

  const EXTRA_CATS = ["Dessert","Drinks","Salad","Soup","Street Food","Side Dish"];
  const ALL_CATS   = ["All", ...MEALS, ...EXTRA_CATS];
  const foodCats   = fd => Array.isArray(fd.categories) ? fd.categories : [fd.category].filter(Boolean);

  const filtered = (() => {
    let list = cat==="All" ? foods : foods.filter(fd => foodCats(fd).includes(cat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || foodCats(f).some(c=>c.toLowerCase().includes(q)));
    }
    return [...list].sort((a,b) => {
      const af=favs[a.id]?1:0, bf=favs[b.id]?1:0;
      if (bf!==af) return bf-af;
      const au=usageCnt[a.name]||0, bu=usageCnt[b.name]||0;
      if (bu!==au) return bu-au;
      return a.name.localeCompare(b.name);
    });
  })();

  const fv = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const startAdd  = () => { setPhotoPreview(null); setForm({ name:"", name_hi:"", categories:["Breakfast"], emoji:"🍽️", photo_url:"", calories:"", protein:"", carbs:"", fat:"", fiber:"", portion:"", ingredients:"", recipe:"", youtube:"" }); setImportMode(null); };
  const startEdit = fd => { setPhotoPreview(fd.photo_url||null); setForm({ ...fd, name_hi:fd.name_hi||"", categories:Array.isArray(fd.categories)?fd.categories:[fd.category].filter(Boolean), ingredients:(fd.ingredients||[]).join("\n") }); setImportMode(null); };
  const toggleCat = c => setForm(p => { const cats=p.categories||[]; return { ...p, categories: cats.includes(c)?cats.filter(x=>x!==c):[...cats,c] }; });

  const handlePhoto = e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2*1024*1024) { showToast("Image must be under 2MB","error"); return; }
    const reader = new FileReader();
    reader.onload = ev => { setPhotoPreview(ev.target.result); setForm(p=>({...p,photo_url:ev.target.result})); };
    reader.readAsDataURL(file);
  };
  const removePhoto = () => { setPhotoPreview(null); setForm(p=>({...p,photo_url:""})); if(fileRef.current) fileRef.current.value=""; };

  const save = async () => {
    if (!form.name) { showToast("Name is required","error"); return; }
    if (!form.categories?.length) { showToast("Select at least one category","error"); return; }
    setBusy(true);
    try {
      const payload = { ...form, category:form.categories[0], calories:+form.calories||0, protein:+form.protein||0, carbs:+form.carbs||0, fat:+form.fat||0, fiber:+form.fiber||0, ingredients:(form.ingredients||"").split("\n").filter(Boolean), photo_url:form.photo_url||null, name_hi:form.name_hi||null };
      if (form.id) {
        await sbPatch("foods",`id=eq.${form.id}`,payload);
        setFoods(p=>p.map(f=>f.id===form.id?{...f,...payload}:f));
        showToast("Updated!");
      } else {
        const [saved] = await sbPost("foods",[payload]);
        setFoods(p=>[...p,saved]);
        showToast(`${saved.name} added!`);
      }
      setForm(null); setPhotoPreview(null);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const del = async fd => {
    if (!window.confirm(`Remove "${fd.name}"?`)) return;
    try { await sbDel("foods",`id=eq.${fd.id}`); setFoods(p=>p.filter(f=>f.id!==fd.id)); showToast("Removed","info"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const runAiImport = async () => {
    if (!aiInput.trim()) { showToast("Enter at least one dish name","error"); return; }
    setAiBusy(true); setAiPreview([]);
    try {
      const dishes = aiInput.split("\n").map(s=>s.trim()).filter(Boolean);
      const res = await fetch(`${SB_URL}/functions/v1/ai-recipe-proxy`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${SB_KEY}`, "apikey":SB_KEY },
        body: JSON.stringify({ dishes }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Edge function error");
      setAiPreview(data.recipes);
      showToast(`${data.recipes.length} recipes generated! Review and save.`);
    } catch(e) { showToast("AI generation failed: " + e.message,"error"); }
    setAiBusy(false);
  };

  const saveAiItems = async (items) => {
    setBusy(true);
    try {
      const saved = await sbPost("foods", items);
      setFoods(p=>[...p,...(saved||items)]);
      showToast(`${items.length} recipes added! 🎉`);
      setImportMode(null); setAiInput(""); setAiPreview([]);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const removeAiPreview = idx => setAiPreview(p=>p.filter((_,i)=>i!==idx));

  const handleCsv = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const lines = ev.target.result.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/"/g,""));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
          const obj = {};
          headers.forEach((h,i) => obj[h] = vals[i]||"");
          return {
            name:obj.name||"", category:obj.category||"Lunch",
            categories:obj.categories ? obj.categories.split("|").map(s=>s.trim()) : [obj.category||"Lunch"],
            emoji:obj.emoji||"🍽️", calories:+obj.calories||0, protein:+obj.protein||0,
            carbs:+obj.carbs||0, fat:+obj.fat||0, fiber:+obj.fiber||0,
            portion:obj.portion||"", ingredients:obj.ingredients?obj.ingredients.split("|").map(s=>s.trim()):[],
            recipe:obj.recipe||"", youtube:obj.youtube||""
          };
        }).filter(r=>r.name);
        if (!rows.length) { showToast("No valid rows found in CSV","error"); return; }
        setBusy(true);
        const saved = await sbPost("foods", rows);
        setFoods(p=>[...p,...(saved||rows)]);
        showToast(`${rows.length} items imported! 🎉`);
        setImportMode(null); setBusy(false);
      } catch(e) { showToast("CSV error: "+e.message,"error"); setBusy(false); }
    };
    reader.readAsText(file);
    if(csvRef.current) csvRef.current.value="";
  };

  const COLS = [
    ["name","Text","Required","The dish name — e.g. Butter Chicken"],
    ["category","Text","Required","Primary meal slot: Breakfast, Lunch, Evening Snack, Dinner, Dessert, Drinks, Salad, Soup, Street Food, Side Dish"],
    ["categories","Text","Optional","All applicable slots separated by | — e.g. Breakfast|Evening Snack"],
    ["emoji","Emoji","Optional","A single emoji for the dish — e.g. 🍛"],
    ["calories","Number","Optional","Kilocalories per portion — e.g. 350"],
    ["protein","Number","Optional","Protein in grams — e.g. 12"],
    ["carbs","Number","Optional","Carbohydrates in grams — e.g. 45"],
    ["fat","Number","Optional","Fat in grams — e.g. 8"],
    ["fiber","Number","Optional","Dietary fiber in grams — e.g. 4"],
    ["portion","Text","Optional","Serving size — e.g. 1 bowl (200g)"],
    ["ingredients","Text","Optional","Ingredients separated by | — e.g. Rice 1 cup|Onion 1|Salt"],
    ["recipe","Text","Optional","Step-by-step cooking instructions"],
    ["youtube","URL","Optional","YouTube search or video URL"],
  ];

  const TIPS = [
    ["Use | not comma","Separate multiple categories and ingredients with a pipe | character, not a comma — commas separate columns."],
    ["Wrap commas in quotes","If recipe steps contain commas, wrap that cell in double quotes."],
    ["Save as .csv","In Excel: File > Save As > CSV. In Google Sheets: File > Download > CSV."],
    ["Column names are exact","Copy the header row exactly — names are case-sensitive."],
    ["Missing fields are OK","Only name and category are required. Leave others blank and edit later."],
  ];

  return (
    <div>
      {previewFood && <FoodPreviewModal food={previewFood} onClose={()=>setPreviewFood(null)} />}

      {form ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>{setForm(null);setPhotoPreview(null);}} style={{ marginBottom:16 }}>Cancel</button>
          <div className="card">
            <h3 className="serif" style={{ fontSize:20, marginBottom:18 }}>{form.id?"Edit":"Add New"} Food Item</h3>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:8 }}>Food Photo (optional, max 2MB)</label>
              <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                <div style={{ width:100, height:100, borderRadius:12, border:"2px dashed #ddd", overflow:"hidden", flexShrink:0, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {photoPreview ? <img src={photoPreview} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ textAlign:"center" }}><div style={{ fontSize:36 }}>{form.emoji||"🍽️"}</div><div style={{ fontSize:10, color:"#ccc", marginTop:4 }}>No photo</div></div>}
                </div>
                <div style={{ flex:1 }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display:"none" }} id="photoUpload" />
                  <label htmlFor="photoUpload" style={{ display:"inline-block", background:"#F4A200", color:"#fff", padding:"8px 16px", borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer", marginBottom:8 }}>
                    {photoPreview ? "Change Photo" : "Upload Photo"}
                  </label>
                  {photoPreview && <button onClick={removePhoto} className="btn btn-danger btn-sm" style={{ display:"block", marginTop:6 }}>Remove</button>}
                </div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["name",t.foodName,""],["name_hi",t.foodNameHi,""],["emoji",t.emoji,"🍚"],["portion",t.portionSize,"1 bowl (150g)"],["calories",t.calories,"250"],["protein",t.protein,"6"],["carbs",t.carbs,"45"],["fat",t.fat,"5"],["fiber",t.fiber,"3"]].map(([k,l,ph])=>(
                <div key={k}><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{l}</label><input className="input" value={form[k]||""} onChange={fv(k)} placeholder={ph} /></div>
              ))}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:8 }}>Categories * (select all that apply)</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {[...MEALS,...EXTRA_CATS].map(m => {
                  const sel=(form.categories||[]).includes(m);
                  return <button key={m} type="button" onClick={()=>toggleCat(m)} style={{ padding:"7px 14px", borderRadius:20, border:`2px solid ${sel?"#F4A200":"#ddd"}`, background:sel?"#FFF8E1":"#fff", color:sel?"#a87800":"#888", fontWeight:sel?700:400, fontSize:13, cursor:"pointer" }}>{sel?"✓ ":""}{m}</button>;
                })}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>YouTube URL</label>
              <input className="input" value={form.youtube||""} onChange={fv("youtube")} placeholder="https://www.youtube.com/results?search_query=..." />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Ingredients (one per line)</label>
              <textarea className="input" value={form.ingredients||""} onChange={fv("ingredients")} rows={6} style={{ resize:"vertical" }} placeholder={"Flattened rice 1 cup\nOnion 1 medium\nOil 1 tbsp"} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Recipe Instructions</label>
              <textarea className="input" value={form.recipe||""} onChange={fv("recipe")} rows={5} style={{ resize:"vertical" }} />
            </div>
            <button className="btn btn-p" onClick={save} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
              {busy ? t.saving : "Save to Database"}
            </button>
          </div>
        </div>
      ) : importMode==="ai" ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>{ setImportMode(null); setAiPreview([]); setAiInput(""); }} style={{ marginBottom:16 }}>Back to Database</button>
          <div className="card" style={{ marginBottom:16 }}>
            <h3 className="serif" style={{ fontSize:20, marginBottom:6 }}>AI Recipe Generator</h3>
            <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>Type dish names one per line. Claude will generate full recipes, nutrition info and ingredients for all of them at once.</p>
            <textarea className="input" value={aiInput} onChange={e=>setAiInput(e.target.value)} rows={8} style={{ resize:"vertical", marginBottom:14 }} placeholder={"Masala Dosa\nPav Bhaji\nGulab Jamun\nMango Lassi\nAloo Tikki"} />
            <button className="btn btn-p" onClick={runAiImport} disabled={aiBusy} style={{ width:"100%", padding:12, fontSize:15 }}>
              {aiBusy ? "Generating recipes... (15-20 sec)" : "Generate Recipes"}
            </button>
            {aiBusy && <div style={{ textAlign:"center", marginTop:16 }}><div className="spinner" /><p style={{ color:"#aaa", fontSize:12, marginTop:8 }}>Claude is crafting recipes and nutrition data...</p></div>}
          </div>
          {aiPreview.length>0 && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div><h3 className="serif" style={{ fontSize:18 }}>Preview — {aiPreview.length} recipes</h3><p style={{ fontSize:12, color:"#888" }}>Remove any you don't want then save all</p></div>
                <button className="btn btn-p" onClick={()=>saveAiItems(aiPreview)} disabled={busy} style={{ padding:"10px 20px" }}>{busy?t.saving:"Save All"}</button>
              </div>
              <div style={{ display:"grid", gap:12 }}>
                {aiPreview.map((food,i)=>(
                  <div key={i} className="card" style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                    <div style={{ fontSize:40, flexShrink:0 }}>{food.emoji}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{(lang==="hi"&&food.name_hi)||food.name}</div>
                      <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{food.portion} · {(food.categories||[food.category]).join(", ")}</div>
                      <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                        {[["⚡",food.calories,"kcal","#a87800"],["🥩",food.protein+"g","protein","#2D6A4F"],["🌾",food.carbs+"g","carbs","#6B5CE7"],["🧈",food.fat+"g","fat","#C1440E"]].map(([ic,v,l,c])=>(
                          <span key={l} style={{ fontSize:12, color:c }}><b>{v}</b> {l}</span>
                        ))}
                      </div>
                      <div style={{ fontSize:12, color:"#aaa", marginTop:6 }}>{(food.ingredients||[]).slice(0,4).join(" · ")}{food.ingredients?.length>4?` +${food.ingredients.length-4} more`:""}</div>
                    </div>
                    <button onClick={()=>removeAiPreview(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:20 }}>x</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-p" onClick={()=>saveAiItems(aiPreview)} disabled={busy} style={{ width:"100%", padding:13, marginTop:16, fontSize:15 }}>{busy?t.saving:"Save All to Database"}</button>
            </div>
          )}
        </div>
      ) : importMode==="csv" ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>setImportMode(null)} style={{ marginBottom:16 }}>Back to Database</button>
          <div className="card" style={{ marginBottom:16 }}>
            <h3 className="serif" style={{ fontSize:20, marginBottom:6 }}>CSV Import</h3>
            <p style={{ fontSize:13, color:"#888" }}>Import many recipes at once from a spreadsheet. Create your CSV in Excel or Google Sheets then upload here.</p>
          </div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#1A1A2E" }}>Column Reference</div>
            <div style={{ display:"grid", gap:0 }}>
              {COLS.map(([field,type,req,desc],i)=>(
                <div key={field} style={{ display:"grid", gridTemplateColumns:"120px 70px 75px 1fr", gap:8, padding:"8px 0", borderBottom:i<COLS.length-1?"1px solid #f5f0e8":"none", alignItems:"start" }}>
                  <code style={{ fontFamily:"monospace", fontWeight:700, color:"#C1440E", fontSize:13 }}>{field}</code>
                  <span style={{ fontSize:11, color:"#aaa", paddingTop:2 }}>{type}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:req==="Required"?"#C1440E":"#2D6A4F", paddingTop:2 }}>{req}</span>
                  <span style={{ fontSize:12, color:"#555", lineHeight:1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Example CSV</div>
            <p style={{ fontSize:12, color:"#888", marginBottom:10 }}>Copy this header row exactly, then add one dish per row below:</p>
            <div style={{ background:"#1A1A2E", borderRadius:10, padding:14, overflowX:"auto" }}>
              <div style={{ fontSize:11, color:"#a8e6cf", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap" }}>name,category,categories,emoji,calories,protein,carbs,fat,fiber,portion,ingredients,recipe,youtube</div>
              <div style={{ fontSize:11, color:"#ffd3a5", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap", marginTop:4 }}>Poha,Breakfast,Breakfast|Evening Snack,,250,6,45,5,3,1 bowl (150g),Rice flakes 1 cup|Onion 1|Salt,Wash flakes. Saute onion. Add flakes cook 3 min.,https://youtube.com/results?search_query=poha</div>
              <div style={{ fontSize:11, color:"#ffd3a5", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap", marginTop:4 }}>Rajma,Lunch,Lunch|Dinner,,420,18,65,7,14,1 bowl (250g),Kidney beans 1 cup|Onion 2|Tomato 3,Pressure cook rajma. Make gravy. Simmer 15 min.,https://youtube.com/results?search_query=rajma</div>
            </div>
          </div>
          <div className="card" style={{ marginBottom:16, background:"#fffdf7", border:"1px solid #f0e8d8" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10, color:"#a87800" }}>Tips for best results</div>
            <div style={{ display:"grid", gap:10 }}>
              {TIPS.map(([tip,detail])=>(
                <div key={tip} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ color:"#F4A200", fontSize:16, flexShrink:0 }}>›</span>
                  <div><div style={{ fontWeight:600, fontSize:13, color:"#555" }}>{tip}</div><div style={{ fontSize:12, color:"#888", marginTop:2 }}>{detail}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Upload Your CSV</div>
            <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCsv} style={{ display:"none" }} id="csvUpload" />
            <label htmlFor="csvUpload" style={{ display:"block", background:busy?"#ccc":"#F4A200", color:"#fff", padding:"14px", borderRadius:12, fontWeight:700, fontSize:16, cursor:busy?"not-allowed":"pointer", textAlign:"center" }}>
              {busy ? "Importing — please wait..." : "Choose CSV File to Import"}
            </label>
            <p style={{ fontSize:12, color:"#aaa", marginTop:10, textAlign:"center" }}>All rows with a valid name will be imported. You can edit or delete items after import.</p>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.foodDatabaseTitle}</h2>
              <p style={{ color:"#999", fontSize:13 }}>{foods.length} items total</p>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>

              <button className="btn btn-g btn-sm" onClick={()=>setImportMode("ai")} style={{ fontSize:12, borderColor:"#F4A200", color:"#F4A200" }}>AI Import</button>
              <button className="btn btn-p btn-sm" onClick={startAdd}>+ Add Item</button>
            </div>
          </div>
          <div style={{ position:"relative", marginBottom:14 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, color:"#bbb" }}>🔍</span>
            <input ref={searchRef} className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search food items..." style={{ paddingLeft:38, paddingRight:search?36:14 }} />
            {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:18 }}>x</button>}
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {ALL_CATS.map(c=>(
              <button key={c} className="chip" onClick={()=>setCat(c)} style={{ background:cat===c?"#F4A200":"#f0e8d8", color:cat===c?"#fff":"#888", fontWeight:cat===c?700:400 }}>{c}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:13 }}>
            {filtered.map(food=>(
              <div key={food.id||food.name} className="food-card" style={{ position:"relative" }} onClick={()=>setPreviewFood(food)}>
                <button onClick={e=>{e.stopPropagation();toggleFav(food.id);}} style={{ position:"absolute", top:6, right:6, background:"rgba(255,255,255,.85)", border:"none", cursor:"pointer", fontSize:15, borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}>
                  {favs[food.id]?"❤️":"🤍"}
                </button>
                {(usageCnt[food.name]||0)>0 && <div style={{ position:"absolute", top:6, left:6, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10, zIndex:2 }}>x{usageCnt[food.name]}</div>}
                <div style={{ width:"100%", height:100, borderRadius:10, overflow:"hidden", marginBottom:8, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <FoodImage food={food} size={80} radius={0} />
                </div>
                <div style={{ fontWeight:600, textAlign:"center", fontSize:14, marginBottom:3 }}>{(lang==="hi"&&food.name_hi)||food.name}</div>
                <div style={{ fontSize:10, color:"#aaa", textAlign:"center", marginBottom:5, display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}>
                  {foodCats(food).map(c=><span key={c} style={{ background:"#f5f0e8", borderRadius:10, padding:"1px 6px" }}>{c}</span>)}
                </div>
                <div style={{ fontSize:11, color:"#aaa", textAlign:"center", marginBottom:8 }}>{food.portion}</div>
                <div style={{ display:"flex", justifyContent:"space-around", marginBottom:10, fontSize:12 }}>
                  <span style={{ color:"#a87800" }}><b>{food.calories}</b> kcal</span>
                  <span style={{ color:"#2D6A4F" }}><b>{food.protein}g</b> pro</span>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button className="btn btn-g btn-sm" onClick={e=>{e.stopPropagation();startEdit(food);}} style={{ flex:1 }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();del(food);}} style={{ flex:0.6 }}>Del</button>
                </div>
              </div>
            ))}
            {filtered.length===0 && (
              <div style={{ gridColumn:"1/-1", textAlign:"center", padding:50, color:"#ccc" }}>
                <div style={{ fontSize:40 }}>🔍</div>
                <div style={{ marginTop:10 }}>{search ? `No results for "${search}"` : "No items in this category"}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── FINALIZE ─────────────────────────────────────────────────────────────────
function FinalizeView({ days, meals, planner, onToggle, onGenShopping, MICONS, MCOLS, foods }) {
  const t    = useT();
  const lang = useLang();
  const approved = planner.filter(p=>p.finalized).length;
  // Build lookup: English name → Hindi name
  const nameHi = {};
  (foods||[]).forEach(f => { if(f.name_hi) nameHi[f.name] = f.name_hi; });
  const displayName = (englishName) => (lang==="hi" && nameHi[englishName]) ? nameHi[englishName] : englishName;

  const printMenu = () => {
    const finalItems    = planner.filter(p=>p.finalized);
    const isHindi       = lang === "hi";
    // Declare BEFORE use
    const mealColClass  = {"Breakfast":"meal-col-0","Lunch":"meal-col-1","Evening Snack":"meal-col-2","Dinner":"meal-col-3"};
    const mealCellClass = {"Breakfast":"meal-cell-0","Lunch":"meal-cell-1","Evening Snack":"meal-cell-2","Dinner":"meal-cell-3"};
    const mealIcons     = {"Breakfast":"🌅","Lunch":"☀️","Evening Snack":"🍵","Dinner":"🌙"};

    const mealHeaders = meals.map(m =>
      `<th class="meal-col ${mealColClass[m]||'meal-col-1'}">${mealIcons[m]||""} ${isHindi?(t.mealShort[m]||m):m}</th>`
    ).join("");

    const rows = days.map(day => {
      const cols = meals.map(meal => {
        const items = finalItems.filter(p=>p.day===day && p.meal===meal);
        if (!items.length) return `<td class="meal-cell ${mealCellClass[meal]||''} empty">—</td>`;
        const names = [...new Set(items.map(i => `${i.food_emoji||""} ${displayName(i.food_name)}` ))].join("<br/>");
        return `<td class="meal-cell ${mealCellClass[meal]||''}">${names}</td>`;
      }).join("");
      const isTodayRow = day === new Date().toLocaleDateString("en",{weekday:"long"});
      const shortDay   = {"Monday":"Mon","Tuesday":"Tue","Wednesday":"Wed","Thursday":"Thu","Friday":"Fri","Saturday":"Sat","Sunday":"Sun"};
      const dayLbl     = isHindi ? (t.days[day]||day) : (shortDay[day]||day);
      return `<tr><td class="day-cell">${dayLbl}</td>${cols}</tr>`;
    }).join("");

    const title    = isHindi ? "फैमिली किचन — साप्ताहिक मेनू" : "Family Kitchen — Weekly Menu";
    const dayLabel = isHindi ? "दिन" : "Day";
    const genText  = isHindi
      ? `${new Date().toLocaleDateString("hi-IN",{day:"numeric",month:"long",year:"numeric"})} को बनाया`
      : `Generated on ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}`;
    const printBtn = isHindi ? "🖨️ प्रिंट करें" : "🖨️ Print";
    const footer   = isHindi
      ? `फैमिली किचन · Revive Healthcare द्वारा डिज़ाइन · ${new Date().getFullYear()}`
      : `Family Kitchen · Designed by Revive Healthcare · ${new Date().getFullYear()}`;

    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html>
<html><head><title>${title}</title>
<meta charset="UTF-8"/>
<style>
  @page { size:A4 landscape; margin:6mm; }
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color-adjust:exact!important; }
  body { font-family:Arial,'Noto Sans Devanagari',sans-serif; color:#1A1A2E; background:#fff; }

  /* Scale wrapper — JS sets transform to fit one page */
  #page-wrap { transform-origin:top left; }

  /* Header */
  .header { background:linear-gradient(135deg,#1A1A2E,#2D6A4F)!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; padding:10px 16px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; }
  .header-left h1 { font-size:24px; font-weight:900; }
  .header-left p  { font-size:12px; opacity:0.8; margin-top:3px; }
  .header-right { display:flex; gap:10px; align-items:center; }

  /* Table */
  .table-wrap { border-radius:8px; overflow:hidden; border:1px solid #ddd; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }

  /* Column headers */
  thead tr th { padding:10px 12px; font-size:16px; font-weight:800; text-align:left; }
  th.day-col   { background:#1A1A2E!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; width:68px; min-width:68px; }
  th.meal-col-0{ background:#D84E00!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; }
  th.meal-col-1{ background:#1B5E20!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; }
  th.meal-col-2{ background:#B84000!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; }
  th.meal-col-3{ background:#4A148C!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#fff!important; }

  /* Rows */
  tbody tr { border-bottom:1px solid #e8e8e8; }
  tbody tr:last-child { border-bottom:none; }
  td { padding:9px 12px; font-size:15px; vertical-align:middle; line-height:1.5; }
  td.day-cell { font-weight:800; font-size:16px; background:#ECEFF1!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; border-right:2px solid #ccc; color:#1A1A2E!important; width:68px; min-width:68px; white-space:nowrap; }
  td.meal-cell-0{ background:#FFF3E0!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  td.meal-cell-1{ background:#E8F5E9!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  td.meal-cell-2{ background:#FBE9E7!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  td.meal-cell-3{ background:#F3E5F5!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  td.empty { color:#ccc!important; font-style:italic; }

  /* Footer */
  .footer { margin-top:7px; display:flex; justify-content:space-between; align-items:center; padding:7px 12px; background:#1A1A2E!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; border-radius:6px; }
  .footer-left  { font-size:11px; color:rgba(255,255,255,.7)!important; }
  .footer-brand { font-size:11px; color:#F4A200!important; font-weight:700; }

  .print-btn { background:#F4A200!important; color:#fff!important; border:none; padding:8px 20px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:800; margin-bottom:10px; }
  @media print { .no-print { display:none!important; } }
</style>
</head><body>
<script>
  function fitPage() {
    var wrap = document.getElementById('page-wrap');
    if (!wrap) return;
    wrap.style.transform = 'none';
    wrap.style.width = 'auto';
    // A4 landscape usable at 96dpi: (297-12)mm * 3.7795 = ~1077px wide, (210-12)mm * 3.7795 = ~748px tall
    var pw = 1077, ph = 748;
    var ww = wrap.offsetWidth  || wrap.scrollWidth;
    var wh = wrap.offsetHeight || wrap.scrollHeight;
    var sx = pw / ww;
    var sy = ph / wh;
    var scale = Math.min(sx, sy, 1);
    if (scale < 0.99) {
      wrap.style.transformOrigin = 'top left';
      wrap.style.transform = 'scale(' + scale.toFixed(3) + ')';
      // Shrink body to avoid phantom second page
      document.body.style.height = Math.ceil(wh * scale) + 'px';
      document.body.style.overflow = 'hidden';
    }
  }
  window.addEventListener('load', fitPage);
  window.addEventListener('beforeprint', fitPage);
</script>

  <div id="page-wrap">
  <div class="header">
    <div class="header-left">
      <h1>👨‍👩‍👧‍👦 ${title}</h1>
      <p>${genText}</p>
    </div>
    <div style="display:flex;gap:12px;align-items:center;">
      <button class="print-btn no-print" onclick="window.print()">${printBtn}</button>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="day-col">${dayLabel}</th>
        ${mealHeaders}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span class="footer-left">🗓️ ${genText}</span>
    <span class="footer-brand">✅ ${footer}</span>
  </div>
  </div><!-- end page-wrap -->

</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(), 800);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.finalizeTitle}</h2>
          <p style={{ color:"#999", fontSize:13 }}>{t.finalizeSub}</p>
        </div>
        <button
          onClick={printMenu}
          disabled={approved===0}
          style={{ background: approved>0?"#1A1A2E":"#ccc", color:"#fff", border:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:13, cursor:approved>0?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", gap:6 }}>
          {t.printMenu}
        </button>
      </div>
      {days.map(day=>{
        const dayItems = planner.filter(p=>p.day===day);
        if (!dayItems.length) return null;
        return (
          <div key={day} className="card" style={{ marginBottom:14 }}>
            <div className="serif" style={{ fontSize:16, fontWeight:700, marginBottom:12, color:"#1A1A2E", paddingBottom:8, borderBottom:"1px solid #f0e8d8" }}>{t.days[day]||day}</div>
            {meals.map(meal=>{
              const items = dayItems.filter(p=>p.meal===meal);
              if (!items.length) return null;
              return (
                <div key={meal} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#aaa", marginBottom:6 }}>{MICONS[meal]} {t.mealShort[meal]||meal}</div>
                  {items.map((item,i)=>(
                    <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:item.finalized?"#e8f5e9":"#f9f9f9", borderRadius:9, marginBottom:4, border:`1px solid ${item.finalized?"#c8e6c9":"#eee"}`, transition:"all .18s" }}>
                      <span style={{ fontSize:13 }}>{item.food_emoji} {displayName(item.food_name)} <span style={{ color:"#bbb", fontSize:11 }}>— {item.member_name}</span></span>
                      <button onClick={()=>onToggle(item.id,item.finalized)} style={{ background:item.finalized?"#2D6A4F":"#fff", color:item.finalized?"#fff":"#888", border:`1px solid ${item.finalized?"#2D6A4F":"#ddd"}`, padding:"4px 12px", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:600, transition:"all .18s" }}>
                        {item.finalized?`✓ ${t.approved}`:t.approve}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
      {planner.length===0 && <div style={{ textAlign:"center", padding:60, color:"#ccc" }}><div style={{ fontSize:48 }}>📋</div><div style={{ marginTop:12 }}>{t.noMealsPlanned}</div></div>}
      <div style={{ position:"sticky", bottom:20, background:"#fff8f0", borderRadius:14, padding:14, border:"1px solid #ede5d8", marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:"#888" }}>{approved} {t.itemsApproved}</div>
        <button className="btn btn-p" onClick={onGenShopping} disabled={approved===0} style={{ padding:"10px 22px" }}>{t.generateShoppingList}</button>
      </div>
    </div>
  );
}

// ─── SHOPPING ─────────────────────────────────────────────────────────────────
function ShoppingView({ genList, planner, SAPPS, showToast, isHead }) {
  const t = useT();
  const [list,     setList]    = useState(null);
  const [selApp,   setSelApp]  = useState(null);
  const [tab,      setTab]     = useState("list"); // "list" | "shop"

  useEffect(() => { if (list===null) setList(genList()); }, []);

  const toggle  = idx => setList(p => p.map((i,j) => j===idx ? {...i, checked:!i.checked} : i));
  const remove  = idx => setList(p => p.filter((_,j) => j!==idx));
  const addRow  = ()  => setList(p => [...p, { name:"", days:[], checked:false }]);
  const upd     = (idx,v) => setList(p => p.map((i,j) => j===idx ? {...i, name:v} : i));
  const regen   = ()  => { setList(genList()); showToast("Shopping list regenerated!"); };

  const checkedCount   = (list||[]).filter(i=>i.checked).length;
  const uncheckedItems = (list||[]).filter(i=>!i.checked);

  // ── EXPORT as text ──────────────────────────────────────────────────────────
  const exportList = () => {
    if (!list?.length) { showToast("Nothing to export","error"); return; }
    const lines = [
      "🛒 FAMILY KITCHEN — SHOPPING LIST",
      "─────────────────────────────────",
      `Generated: ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}`,
      "",
      "ITEMS TO BUY:",
      ...uncheckedItems.map((i,n) => `  ${n+1}. ${i.name}`),
      "",
      checkedCount > 0 ? "ALREADY HAVE:" : "",
      ...(checkedCount > 0 ? (list||[]).filter(i=>i.checked).map(i => `  ✓ ${i.name}`) : []),
      "",
      `Total: ${uncheckedItems.length} items remaining`,
    ].filter(l => l !== undefined).join("\n");

    // Try native share API first (mobile)
    if (navigator.share) {
      navigator.share({ title:"Family Kitchen Shopping List", text:lines })
        .then(() => showToast("Shared successfully!"))
        .catch(() => fallbackExport(lines));
    } else {
      fallbackExport(lines);
    }
  };

  const fallbackExport = (text) => {
    // Download as .txt file
    const blob = new Blob([text], { type:"text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `shopping-list-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Shopping list downloaded!");
  };

  const printList = () => {
    const lines = (list||[]).map((i,n) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${n+1}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #eee;">${i.name}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.checked?"✓":""}</td></tr>`
    ).join("");
    const w = window.open("","_blank");
    w.document.write(`<html><head><title>Shopping List</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;max-width:600px;margin:0 auto;}
      h2{color:#2D6A4F;}table{width:100%;border-collapse:collapse;}
      th{background:#F4A200;color:#fff;padding:10px 12px;text-align:left;}
      @media print{button{display:none;}}</style></head>
      <body>
        <h2>🛒 Family Kitchen — Shopping List</h2>
        <p style="color:#888">Generated: ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</p>
        <button onclick="window.print()" style="background:#F4A200;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;margin-bottom:16px;">🖨️ Print</button>
        <table><thead><tr><th>#</th><th>Item</th><th>Have?</th></tr></thead><tbody>${lines}</tbody></table>
        <p style="margin-top:20px;color:#aaa;font-size:12px">Family Kitchen · Designed by Revive Healthcare</p>
      </body></html>`);
    w.document.close();
  };

  // ── ONLINE SHOPPING VIEW ───────────────────────────────────────────────────
  if (selApp) return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button className="btn btn-g btn-sm" onClick={()=>{ setSelApp(null); setTab("list"); }}>← Back</button>
        <div>
          <h2 className="serif" style={{ fontSize:20, color:"#1A1A2E" }}>{selApp.logo} {selApp.name}</h2>
          <p style={{ fontSize:12, color:"#999" }}>{uncheckedItems.length} items to shop</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card" style={{ marginBottom:16, background:"#fffdf7" }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:8 }}>
          <span style={{ fontWeight:600, color:"#2D6A4F" }}>✓ {checkedCount} added to cart</span>
          <span style={{ color:"#aaa" }}>{uncheckedItems.length} remaining</span>
        </div>
        <div style={{ background:"#f0f0f0", borderRadius:20, height:8 }}>
          <div style={{ width:`${list?.length ? (checkedCount/list.length)*100 : 0}%`, background:"#2D6A4F", borderRadius:20, height:"100%", transition:"width .3s" }} />
        </div>
      </div>

      {/* All items with search buttons */}
      <div style={{ display:"grid", gap:10 }}>
        {(list||[]).map((item, idx) => (
          <div key={idx} className="card" style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:item.checked?"#f0fdf4":"#fff", border:item.checked?"1px solid #bbf7d0":"1px solid #ede5d8", transition:"all .2s" }}>
            {/* Checkbox */}
            <input type="checkbox" checked={item.checked} onChange={()=>toggle(idx)}
              style={{ width:20, height:20, cursor:"pointer", accentColor:"#2D6A4F", flexShrink:0 }} />

            {/* Item name */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:500, color:item.checked?"#86efac":"#1A1A2E", textDecoration:item.checked?"line-through":"none" }}>{item.name}</div>
              {item.days?.length>0 && <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>Used in: {item.days.slice(0,2).join(", ")}</div>}
            </div>

            {/* Search button */}
            {!item.checked && (
              <a href={`${selApp.url}${encodeURIComponent(
                item.name
                  .replace(/\s*[\(\[×xX\-–]\s*.*/,"") // strip (qty), [qty], × qty, - qty
                  .replace(/\s+\d[\d\/\.]*\s*(kg|g|gm|gms|ml|l|ltr|pcs|pc|nos|cups?|tbsp|tsp|dozen|dozen|units?)\b.*/i,"") // strip trailing quantities
                  .trim()
                  .split(" ").slice(0,4).join(" ")
              )}`}
                target="_blank" rel="noreferrer"
                onClick={()=>toggle(idx)}
                style={{ background:selApp.color, color:selApp.color==="#F5C518"?"#1A1A2E":"#fff", padding:"7px 14px", borderRadius:9, textDecoration:"none", fontWeight:700, fontSize:12, flexShrink:0, whiteSpace:"nowrap" }}>
                🔍 Search
              </a>
            )}
            {item.checked && (
              <span style={{ color:"#2D6A4F", fontWeight:700, fontSize:18, flexShrink:0 }}>✓</span>
            )}
          </div>
        ))}
      </div>

      {uncheckedItems.length === 0 && (
        <div style={{ textAlign:"center", padding:40, marginTop:16 }}>
          <div style={{ fontSize:52 }}>🎉</div>
          <h3 className="serif" style={{ fontSize:22, marginTop:12 }}>All done!</h3>
          <p style={{ color:"#999", fontSize:13, marginTop:8 }}>All items have been added to your {selApp.name} cart</p>
          <button className="btn btn-p" onClick={()=>{ setSelApp(null); setTab("list"); }} style={{ marginTop:16 }}>← Back to List</button>
        </div>
      )}
    </div>
  );

  // ── MAIN SHOPPING LIST ─────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.shoppingList}</h2>
          <p style={{ color:"#999", fontSize:13 }}>{uncheckedItems.length} items remaining · {checkedCount} have</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <button className="btn btn-g btn-sm" onClick={addRow}>+ Add</button>
          {isHead && <button className="btn btn-g btn-sm" onClick={regen}>↻ Refresh</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", background:"#f5f0e8", borderRadius:10, padding:4, marginBottom:16, gap:2 }}>
        {[["list",t.listTab],["shop",t.orderOnlineTab]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{ flex:1, padding:"10px 4px", borderRadius:8, border:"none",
            background: tab===v ? (v==="shop" ? "#F4A200" : "#fff") : (v==="shop" ? "rgba(244,162,0,0.12)" : "transparent"),
            fontWeight: 700, fontSize:13, cursor:"pointer",
            color: tab===v ? (v==="shop" ? "#fff" : "#1A1A2E") : (v==="shop" ? "#c47f00" : "#999"),
            boxShadow: tab===v ? "0 2px 8px rgba(0,0,0,.12)" : "none",
            border: tab!==v && v==="shop" ? "1.5px solid rgba(244,162,0,0.4)" : "none",
            transition:"all .18s" }}>{l}</button>
        ))}
      </div>

      {list===null || list.length===0 ? (
        <div style={{ textAlign:"center", padding:60, background:"#fff", borderRadius:16, border:"1px solid #ede5d8" }}>
          <div style={{ fontSize:56 }}>🛒</div>
          <h3 className="serif" style={{ fontSize:20, marginTop:14 }}>No shopping list yet</h3>
          <p style={{ color:"#999", marginTop:8, fontSize:13 }}>The Kitchen Head must finalize the menu first</p>
        </div>
      ) : tab==="list" ? (
        <div>
          {/* Export / Print actions */}
          <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
            <button onClick={exportList} className="btn btn-g" style={{ fontSize:13, flex:1 }}>
              📤 Share / Save
            </button>
            <button onClick={printList} className="btn btn-g" style={{ fontSize:13, flex:1 }}>
              🖨️ Print
            </button>
          </div>

          {/* List */}
          <div className="card" style={{ marginBottom:16 }}>
            {list.map((item,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<list.length-1?"1px solid #f5f0e8":"none" }}>
                <input type="checkbox" checked={item.checked} onChange={()=>toggle(i)} style={{ width:18, height:18, cursor:"pointer", accentColor:"#2D6A4F" }} />
                <input value={item.name} onChange={e=>upd(i,e.target.value)}
                  style={{ flex:1, border:"none", fontSize:14, color:item.checked?"#ccc":"#1A1A2E", textDecoration:item.checked?"line-through":"none", outline:"none", background:"transparent" }} />
                {item.days?.length>0 && <span style={{ fontSize:10, color:"#ddd", whiteSpace:"nowrap" }}>{item.days[0]}</span>}
                <button onClick={()=>remove(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffbbbb", fontSize:18, padding:"0 3px" }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#888", padding:"4px 0" }}>
            <span>{uncheckedItems.length} items to buy</span>
            <span>{checkedCount} already have</span>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>Choose a delivery app. You'll see all items with a search button against each one — shop in any order.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12 }}>
            {SAPPS.map(app=>(
              <button key={app.name} onClick={()=>setSelApp(app)}
                style={{ background:"#fff", border:`2px solid ${app.color}`, borderRadius:14, padding:"14px 10px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}
                onMouseEnter={e=>e.currentTarget.style.background=`${app.color}22`}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <div style={{ fontSize:30 }}>{app.logo}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#1A1A2E", marginTop:6 }}>{app.name}</div>
                <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{uncheckedItems.length} items</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
function SettingsView({ member, family, showToast, lang, onLangChange, isHead, members, authToken, onDeleteAccount }) {
  const t = useT();
  const [section, setSection] = useState(null); // null | "feedback"
  const [notifEnabled, setNotifEnabled] = useState(Notification?.permission === "granted");

  const appVersion = "1.0.0";
  const [delBusy,    setDelBusy]    = useState(false);
  const [showChPw,   setShowChPw]   = useState(false);
  const [chPwNew,    setChPwNew]    = useState("");
  const [chPwConf,   setChPwConf]   = useState("");
  const [chPwBusy,   setChPwBusy]   = useState(false);

  const handleChangePw = async () => {
    if (chPwNew.length < 6) { showToast(lang==="hi" ? "पासवर्ड कम से कम 6 अक्षर का होना चाहिए" : "Password must be at least 6 characters","error"); return; }
    if (chPwNew !== chPwConf) { showToast(lang==="hi" ? "पासवर्ड मेल नहीं खाते" : "Passwords do not match","error"); return; }
    setChPwBusy(true);
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        method:"PUT",
        headers:{ ...H, Authorization:`Bearer ${authToken}` },
        body: JSON.stringify({ password: chPwNew })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.msg||d.error_description||"Failed to update password");
      showToast(lang==="hi" ? "पासवर्ड बदल गया! ✅" : "Password changed successfully! ✅");
      setShowChPw(false); setChPwNew(""); setChPwConf("");
    } catch(e) { showToast(e.message,"error"); }
    setChPwBusy(false);
  };
  const [showDelBox, setShowDelBox] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");

  const handleDeleteAccount = async () => {
    // Head with other members — must transfer first
    if (isHead && (members||[]).filter(m=>m.auth_id && m.id!==member.id).length > 0) {
      showToast(t.deleteAccountHead, "error"); return;
    }
    if (delConfirm !== "DELETE") {
      showToast(lang==="hi" ? "DELETE टाइप करें" : "Please type DELETE to confirm", "error"); return;
    }
    setDelBusy(true);
    try {
      const SB_URL = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
      const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";

      // If last member — delete family + planner + members first
      const isLastMember = (members||[]).filter(m=>m.auth_id).length <= 1;
      if (isLastMember && family?.id) {
        await fetch(`${SB_URL}/rest/v1/planner_items?family_id=eq.${family.id}`, { method:"DELETE", headers:{ "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}` } });
        await fetch(`${SB_URL}/rest/v1/members?family_id=eq.${family.id}`, { method:"DELETE", headers:{ "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}` } });
        await fetch(`${SB_URL}/rest/v1/families?id=eq.${family.id}`, { method:"DELETE", headers:{ "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}` } });
      }

      // Call Edge Function to delete auth user + member row + push subs
      const res = await fetch(`${SB_URL}/functions/v1/delete-account`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${authToken}`, "apikey":SB_KEY },
        body: JSON.stringify({ familyId: family?.id, memberName: member?.name }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Deletion failed");

      showToast(lang==="hi" ? "अकाउंट डिलीट हो गया। अलविदा! 👋" : "Account deleted. Goodbye! 👋");
      setTimeout(() => onDeleteAccount(), 1500);
    } catch(e) { showToast(e.message, "error"); }
    setDelBusy(false);
  };

  const toggleNotifications = async () => {
    if (!("Notification" in window)) { showToast("Notifications not supported on this browser","error"); return; }
    if (Notification.permission === "granted") {
      showToast(lang==="hi" ? "नोटिफिकेशन बंद करने के लिए ब्राउज़र सेटिंग्स में जाएं" : "To disable notifications, go to your browser settings","info");
    } else {
      const perm = await Notification.requestPermission();
      if (perm === "granted") { setNotifEnabled(true); showToast(lang==="hi" ? "नोटिफिकेशन चालू हो गया! ✅" : "Notifications enabled! ✅"); }
      else { showToast(lang==="hi" ? "अनुमति नहीं मिली" : "Permission denied","error"); }
    }
  };

  if (section === "feedback") return (
    <div>
      <button className="btn btn-g btn-sm" onClick={()=>setSection(null)} style={{ marginBottom:16 }}>
        ← {lang==="hi" ? "सेटिंग्स" : "Settings"}
      </button>
      <FeedbackView member={member} family={family} showToast={showToast} />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#1A1A2E" }}>
          ⚙️ {lang==="hi" ? "सेटिंग्स" : "Settings"}
        </h2>
        <p style={{ color:"#999", fontSize:13, marginTop:4 }}>
          {lang==="hi" ? "ऐप की सेटिंग्स और जानकारी" : "App preferences and information"}
        </p>
      </div>

      {/* PREFERENCES */}
      <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.8 }}>
        {lang==="hi" ? "प्राथमिकताएं" : "Preferences"}
      </div>
      <div className="card" style={{ marginBottom:18 }}>
        {/* Language toggle */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #f5f0e8" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22 }}>🌐</span>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:"#1A1A2E" }}>{lang==="hi" ? "भाषा" : "Language"}</div>
              <div style={{ fontSize:12, color:"#aaa" }}>{lang==="hi" ? "हिंदी / English" : "Hindi / English"}</div>
            </div>
          </div>
          <button
            onClick={()=>onLangChange(lang==="en"?"hi":"en")}
            style={{ background:lang==="hi"?"#fff8e1":"#f0fdf4", border:`1px solid ${lang==="hi"?"#F4A200":"#2D6A4F"}`, color:lang==="hi"?"#a87800":"#2D6A4F", padding:"6px 16px", borderRadius:20, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {lang==="en" ? "हिंदी" : "English"}
          </button>
        </div>

        {/* Notifications */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22 }}>🔔</span>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:"#1A1A2E" }}>{lang==="hi" ? "नोटिफिकेशन" : "Notifications"}</div>
              <div style={{ fontSize:12, color:"#aaa" }}>
                {notifEnabled
                  ? (lang==="hi" ? "चालू है" : "Enabled")
                  : (lang==="hi" ? "बंद है" : "Disabled")}
              </div>
            </div>
          </div>
          <button
            onClick={toggleNotifications}
            style={{ background:notifEnabled?"#e8f5e9":"#f5f5f5", border:`1px solid ${notifEnabled?"#c8e6c9":"#ddd"}`, color:notifEnabled?"#2D6A4F":"#999", padding:"6px 16px", borderRadius:20, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {notifEnabled ? (lang==="hi" ? "✓ चालू" : "✓ On") : (lang==="hi" ? "चालू करें" : "Turn On")}
          </button>
        </div>
      </div>

      {/* ACCOUNT INFO */}
      <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.8 }}>
        {lang==="hi" ? "अकाउंट जानकारी" : "Account"}
      </div>
      <div className="card" style={{ marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"6px 0", borderBottom:"1px solid #f5f0e8", marginBottom:10 }}>
          <div style={{ width:46, height:46, borderRadius:"50%", background:"linear-gradient(135deg,#F4A200,#e09800)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, color:"#fff", flexShrink:0 }}>
            {(member?.name||"?")[0]}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#1A1A2E" }}>{member?.name}</div>
            <div style={{ fontSize:12, color:"#aaa" }}>✉️ {member?.email}</div>
            {isHead && <div style={{ fontSize:11, color:"#F4A200", fontWeight:700, marginTop:2 }}>★ Kitchen Head</div>}
          </div>
        </div>
        {[
          [lang==="hi"?"परिवार":"Family",   family?.name],
          [lang==="hi"?"Family ID":"Family ID", family?.id],
        ].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f9f5ef", fontSize:13 }}>
            <span style={{ color:"#aaa" }}>{k}</span>
            <span style={{ fontWeight:600, color:"#555", fontFamily:k==="Family ID"?"monospace":"inherit", fontSize:k==="Family ID"?12:13 }}>{v}</span>
          </div>
        ))}
        {/* Change Password */}
        {!showChPw ? (
          <button onClick={()=>setShowChPw(true)}
            style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", background:"none", border:"none", cursor:"pointer", marginTop:4 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:22 }}>🔑</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontWeight:600, fontSize:14, color:"#1A1A2E" }}>{lang==="hi" ? "पासवर्ड बदलें" : "Change Password"}</div>
                <div style={{ fontSize:12, color:"#aaa" }}>{lang==="hi" ? "नया पासवर्ड सेट करें" : "Set a new password for your account"}</div>
              </div>
            </div>
            <span style={{ color:"#F4A200", fontSize:20 }}>›</span>
          </button>
        ) : (
          <div style={{ paddingTop:12 }}>
            <div style={{ fontWeight:600, fontSize:14, color:"#1A1A2E", marginBottom:12 }}>🔑 {lang==="hi" ? "नया पासवर्ड" : "Change Password"}</div>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{lang==="hi" ? "नया पासवर्ड" : "New Password"}</label>
            <PwInput value={chPwNew} onChange={e=>setChPwNew(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" style={{ marginBottom:10 }} />
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{lang==="hi" ? "पासवर्ड दोबारा दर्ज करें" : "Confirm Password"}</label>
            <PwInput value={chPwConf} onChange={e=>setChPwConf(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" style={{ marginBottom:14 }} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleChangePw} disabled={chPwBusy}
                style={{ flex:1, background:"#F4A200", color:"#fff", border:"none", padding:"11px", borderRadius:10, fontWeight:700, fontSize:14, cursor:chPwBusy?"not-allowed":"pointer", opacity:chPwBusy?0.7:1 }}>
                {chPwBusy ? "..." : (lang==="hi" ? "सेव करें" : "Save Password")}
              </button>
              <button onClick={()=>{ setShowChPw(false); setChPwNew(""); setChPwConf(""); }} className="btn btn-g" style={{ flex:0.6 }}>
                {lang==="hi" ? "रद्द करें" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FEEDBACK */}
      <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.8 }}>
        {lang==="hi" ? "मदद और सुझाव" : "Help & Feedback"}
      </div>
      <div className="card" style={{ marginBottom:18 }}>
        <button onClick={()=>setSection("feedback")}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", background:"none", border:"none", cursor:"pointer", borderBottom:"1px solid #f5f0e8" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22 }}>💬</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontWeight:600, fontSize:14, color:"#1A1A2E" }}>{lang==="hi" ? "सुझाव / फीडबैक भेजें" : "Send Feedback / Suggestion"}</div>
              <div style={{ fontSize:12, color:"#aaa" }}>{lang==="hi" ? "बग रिपोर्ट, नया फीचर या सुझाव" : "Bug reports, feature requests, ideas"}</div>
            </div>
          </div>
          <span style={{ color:"#F4A200", fontSize:20 }}>›</span>
        </button>

      </div>

      {/* ABOUT */}
      <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.8 }}>
        {lang==="hi" ? "ऐप के बारे में" : "About"}
      </div>
      <div className="card" style={{ marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"8px 0" }}>
          <span style={{ fontSize:36 }}>👨‍👩‍👧‍👦</span>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#1A1A2E" }}>Family Kitchen</div>
            <div style={{ fontSize:12, color:"#aaa" }}>Version {appVersion}</div>
            <div style={{ fontSize:12, color:"#2D6A4F", marginTop:2 }}>✅ Designed by Revive Healthcare</div>
          </div>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#C1440E", textTransform:"uppercase", letterSpacing:.8 }}>
        {lang==="hi" ? "खतरनाक ज़ोन" : "Danger Zone"}
      </div>
      <div className="card" style={{ border:"1px solid #ffdddd", background:"#fffafa", marginBottom:32 }}>
        {!showDelBox ? (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:"#C1440E" }}>🗑️ {t.deleteAccount}</div>
              <div style={{ fontSize:12, color:"#aaa", marginTop:3 }}>{t.deleteAccountSub}</div>
            </div>
            <button
              onClick={()=>{ setShowDelBox(true); setDelConfirm(""); }}
              style={{ background:"#C1440E", color:"#fff", border:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer", flexShrink:0 }}>
              {lang==="hi" ? "डिलीट करें" : "Delete"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#C1440E", marginBottom:10 }}>
              ⚠️ {lang==="hi" ? "अंतिम चेतावनी" : "Final Warning"}
            </div>
            <div style={{ background:"#fff3f3", border:"1px solid #ffcccc", borderRadius:10, padding:12, marginBottom:14, fontSize:13, color:"#555", lineHeight:1.7 }}>
              {isHead && (members||[]).filter(m=>m.auth_id && m.id!==member?.id).length > 0
                ? t.deleteAccountHead
                : (members||[]).filter(m=>m.auth_id).length <= 1
                  ? t.deleteAccountLast
                  : t.deleteAccountWarn}
            </div>
            {/* Only show confirm input if not blocked by Head rule */}
            {!(isHead && (members||[]).filter(m=>m.auth_id && m.id!==member?.id).length > 0) && (
              <>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>
                  {lang==="hi" ? "नीचे DELETE टाइप करें:" : "Type DELETE below to confirm:"}
                </label>
                <input
                  className="input"
                  value={delConfirm}
                  onChange={e=>setDelConfirm(e.target.value)}
                  placeholder="DELETE"
                  style={{ marginBottom:14, borderColor: delConfirm==="DELETE"?"#C1440E":"#ddd", fontWeight:700, letterSpacing:2 }}
                />
                <button
                  onClick={handleDeleteAccount}
                  disabled={delBusy || delConfirm!=="DELETE"}
                  style={{ width:"100%", background: delConfirm==="DELETE"?"#C1440E":"#eee", color: delConfirm==="DELETE"?"#fff":"#aaa", border:"none", padding:"12px", borderRadius:10, fontWeight:700, fontSize:15, cursor: delConfirm==="DELETE"?"pointer":"not-allowed", marginBottom:8 }}>
                  {delBusy ? t.deleting : (lang==="hi" ? "🗑️ अकाउंट हमेशा के लिए डिलीट करें" : "🗑️ Permanently Delete My Account")}
                </button>
              </>
            )}
            <button onClick={()=>{ setShowDelBox(false); setDelConfirm(""); }} className="btn btn-g" style={{ width:"100%" }}>
              {lang==="hi" ? "रद्द करें" : "Cancel"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FEEDBACK VIEW ────────────────────────────────────────────────────────────
function FeedbackView({ member, family, showToast }) {
  const t    = useT();
  const lang = useLang();
  const [form, setForm] = useState({
    name:    member?.name || "",
    email:   member?.email || "",
    phone:   "",
    category:"suggestion",
    message: "",
  });
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);

  const categories = [
    { value:"suggestion", label: lang==="hi" ? "💡 सुझाव"        : "💡 Suggestion"       },
    { value:"bug",        label: lang==="hi" ? "🐛 बग रिपोर्ट"   : "🐛 Bug Report"       },
    { value:"feature",    label: lang==="hi" ? "✨ नया फीचर"      : "✨ Feature Request"  },
    { value:"other",      label: lang==="hi" ? "📝 अन्य"          : "📝 Other"            },
  ];

  const handleSubmit = async () => {
    if (!form.name.trim())    { showToast(lang==="hi"?"नाम आवश्यक है":"Name is required","error"); return; }
    if (!form.message.trim()) { showToast(lang==="hi"?"सुझाव लिखें":"Please write your message","error"); return; }
    setBusy(true);
    try {
      const SB_URL = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
      const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
      const res = await fetch(`${SB_URL}/functions/v1/send-feedback`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${SB_KEY}`, "apikey":SB_KEY },
        body: JSON.stringify({
          ...form,
          familyId:   family?.id,
          memberName: member?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send");
      setSent(true);
      showToast(lang==="hi" ? "सुझाव भेजा गया! धन्यवाद 🙏" : "Feedback sent! Thank you 🙏");
    } catch(e) {
      showToast((lang==="hi"?"भेजने में त्रुटि: ":"Error sending: ") + e.message, "error");
    }
    setBusy(false);
  };

  if (sent) return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:72 }}>🙏</div>
      <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#1A1A2E", marginTop:16 }}>
        {lang==="hi" ? "धन्यवाद!" : "Thank you!"}
      </h2>
      <p style={{ color:"#888", fontSize:14, marginTop:10, lineHeight:1.7 }}>
        {lang==="hi"
          ? "आपका सुझाव हमें मिल गया। हम जल्द ही इस पर काम करेंगे।"
          : "Your feedback has been received. We'll review it and work on improvements."}
      </p>
      <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:16, margin:"20px auto", maxWidth:320 }}>
        <p style={{ fontSize:13, color:"#2D6A4F", fontWeight:600 }}>✅ Revive Healthcare</p>
        <p style={{ fontSize:12, color:"#888", marginTop:4 }}>admin@revivehealthcare.co.in</p>
      </div>
      <button className="btn btn-p" onClick={()=>setSent(false)} style={{ marginTop:8 }}>
        {lang==="hi" ? "और सुझाव भेजें" : "Send Another"}
      </button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#1A1A2E" }}>
          {lang==="hi" ? "💬 सुझाव भेजें" : "💬 Send Feedback"}
        </h2>
        <p style={{ color:"#999", fontSize:13, marginTop:4 }}>
          {lang==="hi"
            ? "आपके सुझाव हमें ऐप को बेहतर बनाने में मदद करते हैं"
            : "Your suggestions help us improve the app for everyone"}
        </p>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        {/* Category selector */}
        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:8 }}>
            {lang==="hi" ? "फीडबैक का प्रकार" : "Feedback Type"}
          </label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {categories.map(c=>(
              <button key={c.value} onClick={()=>setForm(p=>({...p,category:c.value}))}
                style={{ padding:"10px 8px", borderRadius:10, border:`2px solid ${form.category===c.value?"#F4A200":"#ede5d8"}`, background:form.category===c.value?"#fff8e1":"#fff", color:form.category===c.value?"#a87800":"#888", fontWeight:form.category===c.value?700:400, fontSize:13, cursor:"pointer", transition:"all .18s", textAlign:"center" }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>
            {lang==="hi" ? "आपका नाम *" : "Your Name *"}
          </label>
          <input className="input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
            placeholder={lang==="hi" ? "नाम दर्ज करें" : "Enter your name"} />
        </div>

        {/* Email */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>
            {lang==="hi" ? "ईमेल (वैकल्पिक)" : "Email (optional)"}
          </label>
          <input className="input" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
            placeholder="you@gmail.com" type="email" />
        </div>

        {/* Phone */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>
            {lang==="hi" ? "फ़ोन नंबर (वैकल्पिक)" : "Phone Number (optional)"}
          </label>
          <input className="input" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}
            placeholder={lang==="hi" ? "10 अंक का नंबर" : "10-digit number"} type="tel" />
        </div>

        {/* Message */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>
            {lang==="hi" ? "आपका सुझाव *" : "Your Message *"}
          </label>
          <textarea className="input" value={form.message}
            onChange={e=>setForm(p=>({...p,message:e.target.value}))}
            rows={5} style={{ resize:"vertical" }}
            placeholder={lang==="hi"
              ? "अपना सुझाव या समस्या यहाँ लिखें..."
              : "Describe your suggestion, bug, or idea in detail..."} />
          <div style={{ textAlign:"right", fontSize:11, color:"#ccc", marginTop:4 }}>{form.message.length} chars</div>
        </div>

        <button className="btn btn-p" onClick={handleSubmit} disabled={busy}
          style={{ width:"100%", padding:14, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {busy
            ? (lang==="hi" ? "भेजा जा रहा है..." : "Sending...")
            : (lang==="hi" ? "📤 सुझाव भेजें" : "📤 Send Feedback")}
        </button>
      </div>

      {/* Contact info card */}
      <div className="card" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
        <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:8 }}>
          {lang==="hi" ? "📬 सीधे संपर्क करें" : "📬 Direct Contact"}
        </div>
        <p style={{ fontSize:13, color:"#555", lineHeight:1.8 }}>
          <b>Revive Healthcare</b><br/>
          📧 admin@revivehealthcare.co.in<br/>
        </p>
        <p style={{ fontSize:12, color:"#aaa", marginTop:8 }}>
          {lang==="hi"
            ? "हम आमतौर पर 24-48 घंटों में जवाब देते हैं"
            : "We typically respond within 24-48 hours"}
        </p>
      </div>
    </div>
  );
}

// ─── FAMILY MANAGEMENT ────────────────────────────────────────────────────────
// ─── HEAD TRANSFER BANNER ────────────────────────────────────────────────────
function HeadTransferBanner({ member, family, members, setMembers, setFamily, showToast, onHeadChange }) {
  const t    = useT();
  const lang = useLang();
  const [invite,  setInvite]  = useState(null);
  const [busy,    setBusy]    = useState(false);
  const SB_URL2 = SB_URL;
  const SB_KEY2 = SB_KEY;

  const loadInvite = React.useCallback(async () => {
    if (!member?.id || !family?.id) return;
    try {
      const rows = await sbGet("head_transfer_invites",
        `family_id=eq.${family.id}&status=eq.pending&order=created_at.desc&limit=1`);
      if (rows?.length) setInvite(rows[0]);
      else setInvite(null);
    } catch(_) {}
  }, [member?.id, family?.id]);

  useEffect(() => { loadInvite(); }, [loadInvite]);

  // Auto-expire check
  useEffect(() => {
    if (!invite) return;
    if (new Date(invite.expires_at) < new Date()) {
      sbPatch("head_transfer_invites", `id=eq.${invite.id}`, { status:"expired" });
      setInvite(null);
      showToast(t.makeHeadExpired, "error");
    }
  }, [invite]); // eslint-disable-line

  const hoursLeft = invite ? Math.max(0, Math.round((new Date(invite.expires_at)-new Date())/3600000)) : 0;

  const handleAccept = async () => {
    setBusy(true);
    try {
      // Transfer role
      await sbPatch("members", `id=eq.${invite.from_member_id}`, { role:"member" });
      await sbPatch("members", `id=eq.${invite.to_member_id}`,   { role:"head" });
      await sbPatch("head_transfer_invites", `id=eq.${invite.id}`, { status:"accepted", responded_at: new Date().toISOString() });
      await sbPatch("families", `id=eq.${family.id}`, { head_id: invite.to_member_id });
      showToast(t.makeHeadAccepted);
      setInvite(null);
      if (onHeadChange) onHeadChange();
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await sbPatch("head_transfer_invites", `id=eq.${invite.id}`, { status:"declined", responded_at: new Date().toISOString() });
      showToast(t.makeHeadDeclined);
      setInvite(null);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  // Show to recipient only
  if (!invite || invite.to_member_id !== member?.id) return null;

  return (
    <div style={{ background:"linear-gradient(135deg,#fff8e1,#fff3cd)", border:"2px solid #F4A200", borderRadius:14, padding:16, marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        <span style={{ fontSize:32, flexShrink:0 }}>👑</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#1A1A2E", marginBottom:4 }}>
            {invite.from_name} {t.makeHeadBanner}
          </div>
          <div style={{ fontSize:13, color:"#555", marginBottom:4 }}>{t.makeHeadBannerSub}</div>
          <div style={{ fontSize:11, color:"#a87800", marginBottom:12 }}>
            ⏰ {t.makeHeadPendingExp}: {hoursLeft}h {lang==="hi"?"बाकी":"remaining"}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleAccept} disabled={busy}
              style={{ flex:1, background:"#F4A200", color:"#fff", border:"none", padding:"10px", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>
              {busy?"...":("👑 "+t.makeHeadAccept)}
            </button>
            <button onClick={handleDecline} disabled={busy}
              style={{ flex:0.6, background:"#fff", color:"#888", border:"1px solid #ddd", padding:"10px", borderRadius:10, fontWeight:600, fontSize:13, cursor:"pointer" }}>
              {t.makeHeadDecline}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FamilyView({ family, setFamily, members, setMembers, member, showToast, MCOLS, isHead, onLeaveFamily }) {
  const t    = useT();
  const lang = useLang();
  const [adding, setAdding] = useState(false);
  const [newM,   setNewM]   = useState({ name:"", email:"" });
  const [busy,   setBusy]   = useState(false);
  const [editFam,  setEditFam]  = useState(false);
  const [famName,  setFamName]  = useState(family?.name||"");
  const [showReset,    setShowReset]    = useState(false);
  const [frNewPw,      setFrNewPw]      = useState("");
  const [frConfirm,    setFrConfirm]    = useState("");
  const [pendingInvite, setPendingInvite] = useState(null);

  // Load pending head transfer invite for this family
  useEffect(() => {
    if (!family?.id) return;
    sbGet("head_transfer_invites", `family_id=eq.${family.id}&status=eq.pending&order=created_at.desc&limit=1`)
      .then(rows => setPendingInvite(rows?.[0] || null))
      .catch(()=>{});
  }, [family?.id]); // eslint-disable-line
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [showInvitePop,setShowInvitePop]= useState(false);

  const addMember = async () => {
    if (!newM.name||!newM.email) { showToast("Name and email required","error"); return; }
    const em = newM.email.trim().toLowerCase();
    // Check if this email already has an active account in this family
    const existing = await sbGet("members",`email=eq.${encodeURIComponent(em)}&family_id=eq.${family.id}&select=id,auth_id`).catch(()=>[]);
    if (existing?.length && existing[0].auth_id) { showToast("This email is already a member","error"); return; }
    if (existing?.length && !existing[0].auth_id) { showToast("Invite already sent to this email","info"); return; }
    setBusy(true);
    try {
      // Save as pending invite (auth_id stays null until they register)
      const [saved] = await sbPost("members",[{ family_id:family.id, name:newM.name, username:newM.name, email:em, role:"member", auth_id:null }]);
      setMembers(p=>[...p,saved]);
      setNewM({ name:"", email:"" }); setAdding(false);
      showToast(`${newM.name} added! Share the invite link below with them. 📋`);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const removeMember = async (m) => {
    if (m.id===member.id) { showToast("Can't remove yourself","error"); return; }
    if (!window.confirm(`Remove ${m.name}?`)) return;
    try { await sbDel("members",`id=eq.${m.id}`); setMembers(p=>p.filter(x=>x.id!==m.id)); showToast("Removed","info"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const setHead = async (m) => {
    if (!isHead) return;
    // Warn if member hasn't joined yet (no auth_id)
    if (!m.auth_id) {
      if (!window.confirm(`${t.makeHeadInactiveWarn}\n\n${m.name}`)) return;
    } else {
      if (!window.confirm(`${t.makeHeadConfirm} ${m.name}?\n\n${t.makeHeadConfirmSub}`)) return;
    }
    setBusy(true);
    try {
      // Cancel any existing pending invite first
      await sbPatch("head_transfer_invites",
        `family_id=eq.${family.id}&status=eq.pending`,
        { status:"cancelled" }
      );
      // Create new 48hr invite
      const res = await fetch(`${SB_URL}/rest/v1/head_transfer_invites`, {
        method:"POST",
        headers:{ ...H, Prefer:"return=representation" },
        body: JSON.stringify({
          family_id:      family.id,
          from_member_id: member.id,
          to_member_id:   m.id,
          from_name:      member.name,
          to_name:        m.name,
          status:         "pending",
          expires_at:     new Date(Date.now() + 48*3600*1000).toISOString()
        })
      });
      if (!res.ok) throw new Error("Failed to send invite");
      showToast(`${lang==="hi"?"हेड निमंत्रण भेजा गया":"Head invite sent to"} ${m.name} 👑`);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const cancelHeadInvite = async () => {
    setBusy(true);
    try {
      await sbPatch("head_transfer_invites",
        `family_id=eq.${family.id}&status=eq.pending`,
        { status:"cancelled" }
      );
      showToast(t.makeHeadCancelled);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const renameFamily = async () => {
    try { await sbPatch("families",`id=eq.${family.id}`,{ name:famName }); setFamily(f=>({...f,name:famName})); setEditFam(false); showToast("Family name updated!"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const resetFamilyPassword = async () => {
    if (frNewPw.length < 4)    { showToast("Password too short (min 4 characters)","error"); return; }
    if (frNewPw !== frConfirm) { showToast("Passwords do not match","error"); return; }
    setBusy(true);
    try {
      await sbPatch("families",`id=eq.${family.id}`,{ password:frNewPw });
      setFamily(f=>({...f, password:frNewPw}));
      showToast("Family password updated! Share the new password with your family. 🔑");
      setShowReset(false); setFrNewPw(""); setFrConfirm("");
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const renameMember = async (m, name) => {
    try { await sbPatch("members",`id=eq.${m.id}`,{ name, username:name }); setMembers(p=>p.map(x=>x.id===m.id?{...x,name,username:name}:x)); }
    catch(e) { /* silent */ }
  };

  const leaveFamily = async () => {
    const isLastMember = members.length === 1;
    const isOnlyHead   = isHead && members.filter(m2 => m2.auth_id).length > 1;

    // Head with other members — must transfer first
    if (isHead && !isLastMember) {
      showToast(lang==="hi" ? t.leaveFamilyHead : t.leaveFamilyHead, "error");
      return;
    }

    // Last member — confirm delete entire family
    const confirmMsg = isLastMember
      ? (lang==="hi" ? t.leaveFamilyLast + "\n\n" + t.leaveFamilyLastConfirm : t.leaveFamilyLast + "\n\n" + t.leaveFamilyLastConfirm)
      : (lang==="hi" ? t.leaveFamilyConfirm + "\n\n" + t.leaveFamilyWarn : t.leaveFamilyConfirm + "\n\n" + t.leaveFamilyWarn);

    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      if (isLastMember) {
        // Delete all planner items for this family
        await sbDel("planner_items", `family_id=eq.${family.id}`);
        // Delete all members
        await sbDel("members", `family_id=eq.${family.id}`);
        // Delete the family itself
        await sbDel("families", `id=eq.${family.id}`);
      } else {
        // Just remove this member
        await sbDel("members", `id=eq.${member.id}`);
        // Remove their planner items
        await sbDel("planner_items", `family_id=eq.${family.id}&member_name=eq.${encodeURIComponent(member.name)}`);
      }
      showToast(lang==="hi" ? "परिवार छोड़ दिया। अलविदा! 👋" : "You have left the family. Goodbye! 👋");
      setTimeout(() => onLeaveFamily(), 1200);
    } catch(e) { showToast(e.message, "error"); }
    setBusy(false);
  };

  const resendInvite = async (m) => {
    if (!m.email) { showToast("No email address for this member","error"); return; }
    setBusy(true);
    try {
      const _SB_URL = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
      const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
      const res = await fetch(`${_SB_URL}/functions/v1/send-invite`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${_SB_KEY}`, "apikey":_SB_KEY },
        body: JSON.stringify({ email: m.email, memberName: m.name, familyName: family?.name, headName: member?.name })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send");
      showToast(`Invite sent to ${m.name} (${m.email}) 📧`);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  return (
    <div>
      {/* Head Transfer Banner — shown to invited member */}
      <HeadTransferBanner
        member={member} family={family} members={members}
        setMembers={setMembers} setFamily={setFamily}
        showToast={showToast}
        onHeadChange={()=>window.location.reload()}
      />

      {/* Pending invite notice — shown to current Head */}
      {isHead && pendingInvite && (
        <div style={{ background:"#fff8e1", border:"1.5px solid #ffe082", borderRadius:12, padding:14, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#a87800", marginBottom:4 }}>
                ⏳ {t.makeHeadPending} {pendingInvite.to_name}
              </div>
              <div style={{ fontSize:12, color:"#888" }}>
                {t.makeHeadPendingExp}: {Math.max(0,Math.round((new Date(pendingInvite.expires_at)-new Date())/3600000))}h {lang==="hi"?"बाकी":"remaining"}
              </div>
            </div>
            <button onClick={cancelHeadInvite} disabled={busy}
              style={{ background:"#fff", border:"1px solid #ddd", color:"#C1440E", padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
              {t.makeHeadCancel}
            </button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.familyMembers}</h2>
          {editFam ? (
            <div style={{ display:"flex", gap:8, marginTop:6, alignItems:"center" }}>
              <input className="input" value={famName} onChange={e=>setFamName(e.target.value)} style={{ width:200 }} />
              <button className="btn btn-p btn-sm" onClick={renameFamily}>Save</button>
              <button className="btn btn-g btn-sm" onClick={()=>setEditFam(false)}>Cancel</button>
            </div>
          ) : (
            <p style={{ color:"#999", fontSize:13, cursor:"pointer" }} onClick={()=>isHead&&setEditFam(true)}>{family?.name} {isHead&&<span style={{ color:"#F4A200" }}>✏️</span>}</p>
          )}
        </div>
        {isHead && <button className="btn btn-p" onClick={()=>setAdding(true)}>+ Add Member</button>}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom:16, border:"1px solid #F4A200", background:"#fffdf7" }}>
          <h3 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Invite Family Member</h3>
          <p style={{ fontSize:12, color:"#888", marginBottom:12 }}>Enter their name and email. They register with that email in the app and auto-join your family — no Family ID or password needed.</p>
          {/* Contact Picker — shown only if browser supports it (Android Chrome, iOS Safari 16+) */}
          {"contacts" in navigator && "ContactsManager" in window && (
            <div style={{ marginBottom:14 }}>
              <button
                className="btn btn-g"
                style={{ width:"100%", fontSize:13, padding:"10px", borderStyle:"dashed", borderColor:"#2D6A4F", color:"#2D6A4F", fontWeight:600 }}
                onClick={async () => {
                  try {
                    const contacts = await navigator.contacts.select(["name","email"], { multiple:false });
                    if (!contacts?.length) return;
                    const c  = contacts[0];
                    const nm = Array.isArray(c.name)  ? c.name[0]  : (c.name  || "");
                    const em = Array.isArray(c.email) ? c.email[0] : (c.email || "");
                    setNewM({ name:nm, email:em });
                  } catch(e) { showToast("Contact picker closed","info"); }
                }}>
                📱 Pick from Phone Contacts
              </button>
              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:5 }}>Or enter manually below</p>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }} className="grid-2">
            <div><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Name</label><input className="input" value={newM.name} onChange={e=>setNewM(p=>({...p,name:e.target.value}))} placeholder="Member name" /></div>
            <div><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Email Address</label><input className="input" value={newM.email} onChange={e=>setNewM(p=>({...p,email:e.target.value}))} placeholder="member@email.com" type="email" /></div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn btn-p" onClick={addMember} disabled={busy}>{busy?"Sending...":"📧 Send Invite"}</button>
            <button className="btn btn-g" onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Invite instructions — shown when there are pending members */}
      {members.some(m=>!m.auth_id) && isHead && (
        <div className="card" style={{ marginBottom:4, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:6 }}>📋 How pending members join:</div>
          <div style={{ fontSize:12, color:"#555", lineHeight:1.8 }}>
            1. Tap <b>📤 Share Invite</b> on their card below<br/>
            2. Send them the message via WhatsApp or any chat app<br/>
            3. They tap the link → popup opens automatically with their email pre-prompted<br/>
            4. They enter their email → receive joining link → set password → auto-joined! ✅
          </div>
        </div>
      )}

      {/* Inline invite popup for FamilyView */}
      <InvitePopup
        show={showInvitePop}
        initialEmail={inviteEmail}
        onClose={()=>{ setShowInvitePop(false); setInviteEmail(""); }}
        showToast={showToast}
      />

      <div style={{ display:"grid", gap:12 }}>
        {members.map((m,i)=>{
          const isThisHead = m.id===family?.head_id;
          return (
            <div key={m.id} className="card" style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
              {/* Avatar */}
              <div style={{ width:44, height:44, borderRadius:"50%", background:MCOLS[i%MCOLS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff", flexShrink:0, marginTop:2 }}>{(m.name||"?")[0]}</div>
              {/* Info + buttons stacked */}
              <div style={{ flex:1, minWidth:0 }}>
                {/* Name row */}
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                  <input defaultValue={m.name||m.username} onBlur={e=>e.target.value!==(m.name||m.username)&&renameMember(m,e.target.value)} style={{ border:"none", fontSize:15, fontWeight:600, color:"#1A1A2E", outline:"none", background:"transparent", minWidth:0, flex:1 }} readOnly={!isHead&&m.id!==member.id} />
                  {isThisHead && <span className="badge" style={{ background:"#fff8e1", color:"#a87800", flexShrink:0 }}>★ Head</span>}
                </div>
                {/* Email */}
                <div style={{ fontSize:12, color:"#999", marginBottom:6, wordBreak:"break-all" }}>
                  ✉️ {m.email||"(no email)"}
                  {!m.auth_id && <span style={{ marginLeft:8, background:"#FFF3CD", color:"#856404", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20 }}>⏳ Pending</span>}
                </div>
                {/* Action buttons */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {!m.auth_id && isHead && (<>
                    <button onClick={()=>resendInvite(m)} style={{ background:"#e8f5e9", color:"#2D6A4F", border:"1px solid #c8e6c9", padding:"5px 12px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight:600 }}>
                      📧 Send Link
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Hi ${m.name}! You have been invited to join our Family Kitchen meal planner 👨‍👩‍👧‍👦

Tap this link to join:
https://family-kitchen-gamma-rust.vercel.app?invite=true&email=${encodeURIComponent(m.email||"")}

Your email is already pre-filled — just tap "Send me a link to set my password" and check your inbox!

(Family: ${family.name})`)}`}
                      target="_blank" rel="noreferrer"
                      style={{ background:"#25D366", color:"#fff", border:"none", padding:"5px 12px", borderRadius:8, fontSize:12, fontWeight:600, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4 }}>
                      💬 WhatsApp
                    </a>
                  </>)}
                  {!isThisHead && isHead && <button className="btn btn-g btn-sm" onClick={()=>setHead(m)} style={{ fontSize:11 }}>👑 Make Head</button>}
                  {m.id!==member.id && isHead && <button className="btn btn-danger btn-sm" onClick={()=>removeMember(m)}>Remove</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop:22, background:"#f9f5ff", border:"1px solid #e0d5ff" }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>🔗 Family ID &amp; Password</div>
        <div style={{ background:"#fff", borderRadius:9, padding:"10px 14px", fontFamily:"monospace", fontSize:13, color:"#6B5CE7", border:"1px solid #e0d5ff", wordBreak:"break-all", marginBottom:8 }}>
          Family ID: <b>{family?.id}</b>
        </div>
        <p style={{ fontSize:12, color:"#888", marginBottom:12 }}>
          Share this Family ID + family password with new members. They use "Join Family" on the login screen to join.
        </p>
        {isHead && (
          showReset ? (
            <div style={{ background:"#fff", borderRadius:10, padding:14, border:"1px solid #ddd", marginTop:4 }}>
              <div style={{ fontWeight:600, fontSize:13, color:"#1A1A2E", marginBottom:10 }}>🔑 Reset Family Password</div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>New Family Password</label>
                <PwInput value={frNewPw} onChange={e=>setFrNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.confirmPassword}</label>
                <PwInput value={frConfirm} onChange={e=>setFrConfirm(e.target.value)} placeholder="Re-enter" autoComplete="new-password" />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-p" onClick={resetFamilyPassword} disabled={busy} style={{ flex:1 }}>
                  {busy?"Updating…":t.updatePassword}
                </button>
                <button className="btn btn-g" onClick={()=>{ setShowReset(false); setFrNewPw(""); setFrConfirm(""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowReset(true)} className="btn btn-g" style={{ fontSize:12, width:"100%" }}>
              🔑 Reset Family Password
            </button>
          )
        )}
      </div>

      {/* ── Leave Family — Danger Zone ──────────────────────────── */}
      <div style={{ marginTop:24 }}>
        <div style={{ marginBottom:8, fontSize:11, fontWeight:700, color:"#C1440E", textTransform:"uppercase", letterSpacing:.8 }}>
          {lang==="hi" ? "खतरनाक ज़ोन" : "Danger Zone"}
        </div>
        <div className="card" style={{ border:"1px solid #ffdddd", background:"#fffafa" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:"#C1440E" }}>🚪 {t.leaveFamily}</div>
              <div style={{ fontSize:12, color:"#aaa", marginTop:3 }}>
                {isHead && members.filter(m2=>m2.auth_id).length > 1
                  ? (lang==="hi" ? "पहले किसी और को हेड बनाएं" : "Transfer Head role first")
                  : (lang==="hi" ? "आपका डेटा हटा दिया जाएगा" : "Your data will be removed")}
              </div>
            </div>
            <button
              onClick={leaveFamily}
              disabled={busy}
              style={{ background:"#C1440E", color:"#fff", border:"none", padding:"9px 18px", borderRadius:10, fontWeight:700, fontSize:13, cursor:busy?"not-allowed":"pointer", opacity:busy?0.6:1, flexShrink:0 }}>
              {busy ? "..." : t.leaveFamily}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
