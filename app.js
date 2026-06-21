var OWNER_EMAIL = 'dwilson@illyrobotic-ai.com';
var OWNER_DISPLAY = 'JREY CASH';

var firebaseConfig = {
    apiKey: "AIzaSyDs9vWS1Z2L0w3VEyHCr7vhOveTF_6hcAw",
    authDomain: "jreycash-32ac9.firebaseapp.com",
    projectId: "jreycash-32ac9",
    storageBucket: "jreycash-32ac9.firebasestorage.app",
    messagingSenderId: "100386315419",
    appId: "1:100386315419:web:99eb552259c31ef9bffa3e",
    measurementId: "G-NSMBRBYVTH"
};

var auth, provider, db;
var currentUser = null;
var isOwner = false;

try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    provider = new firebase.auth.GoogleAuthProvider();
} catch (e) {
    console.warn('Firebase init skipped:', e.message);
}

// ── Auth ──
function signInWithGoogle() {
    if (!auth || !provider) { alert('Firebase not initialized.'); return; }
    auth.signInWithPopup(provider).then(function(result) {
        handleSignIn(result.user);
    }).catch(function(err) {
        console.error('Sign-in failed:', err.code, err.message);
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
            auth.signInWithRedirect(provider);
        } else if (err.code === 'auth/unauthorized-domain') {
            alert('Add "' + window.location.hostname + '" to Firebase Auth → Authorized domains.');
        } else {
            alert('Sign-in failed: ' + err.message);
        }
    });
}

if (auth) {
    auth.getRedirectResult().then(function(result) {
        if (result && result.user) handleSignIn(result.user);
    }).catch(function() {});
    auth.onAuthStateChanged(function(user) {
        if (user && !currentUser) handleSignIn(user);
    });
}

function handleSignIn(user) {
    currentUser = {
        uid: user.uid || 'demo',
        displayName: user.displayName || 'Fan',
        email: user.email || '',
        photoURL: user.photoURL || ''
    };

    isOwner = currentUser.email === OWNER_EMAIL;
    if (isOwner) currentUser.displayName = OWNER_DISPLAY;

    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    document.getElementById('user-display-name').textContent = currentUser.displayName;
    document.getElementById('user-email-display').textContent = currentUser.email;

    var photoEl = document.getElementById('user-photo');
    if (currentUser.photoURL) {
        photoEl.src = currentUser.photoURL;
        photoEl.alt = currentUser.displayName;
        photoEl.style.display = 'block';
        photoEl.referrerPolicy = 'no-referrer';
        photoEl.parentElement.style.background = 'none';
    } else {
        photoEl.parentElement.style.background = 'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta))';
        photoEl.style.display = 'none';
    }

    if (isOwner) {
        var badge = document.getElementById('user-prestige');
        if (badge) {
            badge.querySelector('.badge-icon').textContent = '👑';
            badge.querySelector('.badge-level').textContent = 'OWNER';
            badge.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,0,255,0.2))';
            badge.style.borderColor = '#FFD700';
        }
    }

    initUserProfile();
    trackPrestige('login');
    loadLeaderboard();
    loadLiveCommunityFeed();
    loadNotifications();
}

function signOut() {
    if (auth) auth.signOut().catch(function() {});
    currentUser = null;
    isOwner = false;
    document.getElementById('auth-gate').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('user-menu').style.display = 'none';
}

function toggleUserMenu() {
    var menu = document.getElementById('user-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    var menu = document.getElementById('user-menu');
    var avatar = document.getElementById('user-avatar');
    if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !avatar.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ── Portal Access ──
function accessPortal(e) {
    e.preventDefault();
    if (isOwner) {
        window.location.href = 'portal.html';
        return;
    }
    var pin = prompt('Enter 4-digit Owner PIN:');
    if (pin === '1234') {
        window.location.href = 'portal.html';
    } else if (pin !== null) {
        alert('Access Denied: Incorrect PIN.');
    }
}

// ── User Profile (Firestore) ──
function initUserProfile() {
    if (!db || !currentUser || currentUser.uid === 'demo') return;

    var userRef = db.collection('users').doc(currentUser.uid);
    userRef.set({
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL,
        isOwner: isOwner,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        loginCount: firebase.firestore.FieldValue.increment(1)
    }, { merge: true }).then(function() {
        return userRef.get();
    }).then(function(doc) {
        if (doc.exists) {
            var data = doc.data();
            prestigePoints = data.prestigePoints || 0;
            if (!data.joinedAt) {
                userRef.update({
                    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    prestigePoints: 0, videosWatched: 0, totalComments: 0, totalLikes: 0
                });
            }
            updatePrestigeDisplay();
        }
    }).catch(function(err) {
        console.error('Firestore write failed:', err.code, err.message);
    });

    fetchAndStoreLocation(userRef);
}

function fetchAndStoreLocation(userRef) {
    fetch('https://ipapi.co/json/').then(function(res) {
        return res.json();
    }).then(function(geo) {
        if (geo && geo.city) {
            userRef.update({
                location: {
                    city: geo.city || '',
                    region: geo.region || '',
                    country: geo.country_name || '',
                    countryCode: geo.country_code || '',
                    timezone: geo.timezone || '',
                    latitude: geo.latitude || 0,
                    longitude: geo.longitude || 0,
                    ip: geo.ip || ''
                }
            });
        }
    }).catch(function() {
        fetch('https://ip-api.com/json/?fields=city,regionName,country,countryCode,timezone,lat,lon,query').then(function(r) { return r.json(); }).then(function(geo) {
            if (geo && geo.city) {
                userRef.update({
                    location: {
                        city: geo.city || '',
                        region: geo.regionName || '',
                        country: geo.country || '',
                        countryCode: geo.countryCode || '',
                        timezone: geo.timezone || '',
                        latitude: geo.lat || 0,
                        longitude: geo.lon || 0,
                        ip: geo.query || ''
                    }
                });
            }
        }).catch(function() {});
    });
}

// ── Navigation ──
function scrollToSection(e, sectionId) {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    e.currentTarget.classList.add('active');
    var section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Likes (Firestore-backed) ──
function toggleLike(btn, contentId) {
    btn.classList.toggle('liked');
    var icon = btn.querySelector('.like-icon');
    var count = btn.querySelector('.like-count');
    var current = parseInt(count.textContent);
    var liked = btn.classList.contains('liked');

    icon.textContent = liked ? '♥' : '♡';
    count.textContent = liked ? current + 1 : Math.max(0, current - 1);
    if (liked) trackPrestige('like');

    if (db && currentUser && contentId) {
        var likeRef = db.collection('likes').doc(contentId + '_' + currentUser.uid);
        var contentRef = db.collection('content_stats').doc(contentId);
        if (liked) {
            likeRef.set({ userId: currentUser.uid, contentId: contentId, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            contentRef.set({ likeCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        } else {
            likeRef.delete().catch(function() {});
            contentRef.set({ likeCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
        }
    }
}

// ── Comments Modal ──
var activeCommentContentId = null;
var commentUnsubscribe = null;

function openComments(contentId) {
    activeCommentContentId = contentId;
    document.getElementById('comments-modal').style.display = 'flex';
    trackPrestige('view_comments');

    var list = document.getElementById('comments-list');
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Loading...</p>';
    if (commentUnsubscribe) commentUnsubscribe();

    if (db) {
        commentUnsubscribe = db.collection('comments')
            .where('contentId', '==', contentId)
            .orderBy('timestamp', 'desc').limit(50)
            .onSnapshot(function(snapshot) {
                list.innerHTML = '';
                if (snapshot.empty) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No comments yet. Be the first!</p>'; return; }
                snapshot.forEach(function(doc) {
                    var d = doc.data();
                    var timeStr = d.timestamp ? timeAgo(d.timestamp.toDate()) : 'Just now';
                    var avatarHtml = buildAvatar(d.photoURL, d.displayName);
                    var ownerBadge = d.isOwner ? ' <span class="owner-badge-inline">👑 JREY CASH</span>' : '';
                    var el = document.createElement('div');
                    el.className = 'comment';
                    el.innerHTML = '<div class="comment-row">' + avatarHtml + '<div><strong>' + escapeHtml(d.displayName || 'Fan') + '</strong>' + ownerBadge + '<p>' + escapeHtml(d.text) + '</p><span class="comment-time">' + timeStr + '</span></div></div>';
                    list.appendChild(el);
                });
            }, function() { showFallbackComments(list); });
    } else { showFallbackComments(list); }
}

function showFallbackComments(list) {
    list.innerHTML = '<div class="comment"><strong>JefeGang_Nate</strong><p>This is heat 🔥🔥🔥</p><span class="comment-time">2h ago</span></div>';
}

function closeComments() {
    document.getElementById('comments-modal').style.display = 'none';
    if (commentUnsubscribe) { commentUnsubscribe(); commentUnsubscribe = null; }
    activeCommentContentId = null;
}

function postComment() {
    var input = document.getElementById('comment-text');
    var text = input.value.trim();
    if (!text) return;
    var displayName = currentUser ? currentUser.displayName : 'Fan';

    if (db && activeCommentContentId && currentUser) {
        db.collection('comments').add({
            contentId: activeCommentContentId,
            userId: currentUser.uid,
            displayName: displayName,
            photoURL: currentUser.photoURL || '',
            isOwner: isOwner,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    input.value = '';
    trackPrestige('comment');
}

// ── Prestige System ──
var prestigePoints = parseInt(localStorage.getItem('jc_prestige') || '0');
var PRESTIGE_ACTIONS = { login: 10, like: 2, comment: 5, view_comments: 1, purchase: 50, watch_video: 3, store_visit: 2 };

function trackPrestige(action) {
    var points = PRESTIGE_ACTIONS[action] || 0;
    prestigePoints += points;
    localStorage.setItem('jc_prestige', prestigePoints.toString());
    updatePrestigeDisplay();

    if (db && currentUser && currentUser.uid !== 'demo') {
        var updates = { prestigePoints: prestigePoints };
        if (action === 'watch_video') updates.videosWatched = firebase.firestore.FieldValue.increment(1);
        else if (action === 'comment') updates.totalComments = firebase.firestore.FieldValue.increment(1);
        else if (action === 'like') updates.totalLikes = firebase.firestore.FieldValue.increment(1);
        db.collection('users').doc(currentUser.uid).update(updates).catch(function() {});
    }
}

function getPrestigeLevel() {
    if (isOwner) return { level: 99, tier: 'Owner', icon: '👑' };
    if (prestigePoints >= 14000) return { level: 12, tier: 'Diamond', icon: '👑' };
    if (prestigePoints >= 10000) return { level: 10, tier: 'Platinum', icon: '💎' };
    if (prestigePoints >= 6000) return { level: 7, tier: 'Gold', icon: '🥇' };
    if (prestigePoints >= 3000) return { level: 4, tier: 'Silver', icon: '🥈' };
    if (prestigePoints >= 500) return { level: 2, tier: 'Bronze', icon: '🥉' };
    return { level: 1, tier: 'Newcomer', icon: '🔥' };
}

function updatePrestigeDisplay() {
    var p = getPrestigeLevel();
    var badgeEl = document.getElementById('user-prestige');
    if (badgeEl && !isOwner) {
        badgeEl.querySelector('.badge-icon').textContent = p.icon;
        badgeEl.querySelector('.badge-level').textContent = 'LVL ' + p.level;
    }
    var menuLevel = document.getElementById('menu-prestige-level');
    if (menuLevel) menuLevel.textContent = isOwner ? '99 (Owner 👑)' : p.level + ' (' + p.tier + ')';
}

// ── Leaderboard ──
function loadLeaderboard() {
    var container = document.getElementById('leaderboard-list');
    if (!container || !db) return;

    db.collection('users').orderBy('prestigePoints', 'desc').limit(10)
        .onSnapshot(function(snapshot) {
            if (snapshot.empty) return;
            container.innerHTML = '';
            var rank = 0;
            snapshot.forEach(function(doc) {
                rank++;
                var d = doc.data();
                var p = getPrestigeLevelFor(d.prestigePoints || 0);
                var item = document.createElement('div');
                item.className = 'leaderboard-item' + (rank <= 3 ? ' rank-' + rank : '');
                var rankDisplay = rank === 1 ? '👑' : rank.toString();
                var isCurrent = currentUser && doc.id === currentUser.uid;
                var ownerTag = d.isOwner ? ' <span class="owner-badge-inline">👑</span>' : '';
                item.innerHTML = '<span class="lb-rank">' + rankDisplay + '</span><div class="lb-info"><h4 style="font-family:Inter,sans-serif;font-size:0.9rem;font-weight:700;">' + escapeHtml(d.displayName || 'Fan') + ownerTag + (isCurrent ? ' (You)' : '') + '</h4><p style="font-size:0.7rem;color:var(--text-muted);">Level ' + p.level + ' • ' + p.tier + '</p></div><span class="lb-points">' + (d.prestigePoints || 0).toLocaleString() + ' pts</span>';
                container.appendChild(item);
            });
        }, function() {});
}

function getPrestigeLevelFor(pts) {
    if (pts >= 14000) return { level: 12, tier: 'Diamond' };
    if (pts >= 10000) return { level: 10, tier: 'Platinum' };
    if (pts >= 6000) return { level: 7, tier: 'Gold' };
    if (pts >= 3000) return { level: 4, tier: 'Silver' };
    if (pts >= 500) return { level: 2, tier: 'Bronze' };
    return { level: 1, tier: 'Newcomer' };
}

// ── Utilities ──
function escapeHtml(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function timeAgo(date) {
    var s = Math.floor((new Date() - date) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return date.toLocaleDateString();
}

// ── Quick Comment Popup ──
var qcContentId = null, qcContentTitle = null;

function openQuickComment(contentId, contentTitle) {
    qcContentId = contentId; qcContentTitle = contentTitle;
    document.getElementById('qc-content-title').textContent = contentTitle;
    document.getElementById('qc-text').value = '';
    document.getElementById('qc-chars').textContent = '0';
    document.getElementById('quick-comment-popup').style.display = 'flex';
    setTimeout(function() { document.getElementById('qc-text').focus(); }, 100);
}

function closeQuickComment() {
    document.getElementById('quick-comment-popup').style.display = 'none';
    qcContentId = null; qcContentTitle = null;
}

function submitQuickComment() {
    var textarea = document.getElementById('qc-text');
    var text = textarea.value.trim();
    if (!text || !qcContentId) return;

    var displayName = currentUser ? currentUser.displayName : 'Fan';
    var photoURL = currentUser ? currentUser.photoURL || '' : '';

    if (db && currentUser && currentUser.uid !== 'demo') {
        db.collection('community_thread').add({
            contentId: qcContentId,
            contentTitle: qcContentTitle,
            userId: currentUser.uid,
            displayName: displayName,
            photoURL: photoURL,
            isOwner: isOwner,
            text: text,
            likes: 0,
            likedByOwner: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Check for @mentions and create notifications
        var mentions = text.match(/@(\S+)/g);
        if (mentions) {
            mentions.forEach(function(m) {
                var mentionedName = m.substring(1);
                createNotification('mention', mentionedName, displayName, text, qcContentTitle);
            });
        }
    }

    closeQuickComment();
    trackPrestige('comment');
}

// ── Live Community Feed (fully Firestore-driven) ──
var communityUnsubscribe = null;

function loadLiveCommunityFeed() {
    if (!db) return;
    var feed = document.getElementById('thread-feed');
    if (!feed) return;

    if (communityUnsubscribe) communityUnsubscribe();

    communityUnsubscribe = db.collection('community_thread')
        .orderBy('timestamp', 'desc').limit(30)
        .onSnapshot(function(snapshot) {
            feed.innerHTML = '';

            snapshot.forEach(function(doc) {
                var d = doc.data();
                var docId = doc.id;
                var timeStr = d.timestamp ? timeAgo(d.timestamp.toDate()) : 'Just now';
                var avatarHtml = buildAvatar(d.photoURL, d.displayName);
                var tagIcon = getContentIcon(d.contentTitle);

                var ownerBadge = d.isOwner ? '<span class="owner-badge">👑 ARTIST</span>' : '';
                var ownerLikeHtml = d.likedByOwner ? '<div class="owner-liked">👑 Liked by JREY CASH</div>' : '';
                var isLiked = d.likedBy && d.likedBy.indexOf(currentUser ? currentUser.uid : '') >= 0;

                var post = document.createElement('div');
                post.className = 'thread-post' + (d.isOwner ? ' owner-post' : '');
                post.innerHTML =
                    '<div class="thread-left">' +
                        avatarHtml +
                        '<button class="thread-heart' + (isLiked ? ' liked' : '') + '" onclick="heartThreadPost(\'' + docId + '\', this)">' + (isLiked ? '♥' : '♡') + '</button>' +
                        '<span class="thread-likes">' + (d.likes || 0) + '</span>' +
                    '</div>' +
                    '<div class="thread-body">' +
                        '<div class="thread-meta">' +
                            '<strong class="thread-author' + (d.isOwner ? ' owner-name' : '') + '">' + escapeHtml(d.displayName || 'Fan') + '</strong>' +
                            ownerBadge +
                            '<span class="thread-tag">' + tagIcon + ' ' + escapeHtml(d.contentTitle || '') + '</span>' +
                            '<span class="thread-time">' + timeStr + '</span>' +
                        '</div>' +
                        '<p class="thread-text">' + formatThreadText(d.text || '') + '</p>' +
                        ownerLikeHtml +
                        '<button class="thread-reply-btn" onclick="openQuickComment(\'' + (d.contentId || '').replace(/'/g, '') + '\', \'' + escapeHtml(d.contentTitle || '').replace(/'/g, '') + '\')">↩ Reply</button>' +
                    '</div>';
                feed.appendChild(post);
            });

            // Show toast for new posts (only from others)
            snapshot.docChanges().forEach(function(change) {
                if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
                    var d = change.doc.data();
                    if (d.timestamp && currentUser && d.userId !== currentUser.uid) {
                        var prefix = d.isOwner ? '👑 ' : '💬 ';
                        showActivityToast(prefix + (d.displayName || 'Someone') + ' posted about ' + (d.contentTitle || 'content'));
                    }
                }
            });
        }, function(err) { console.warn('Community feed error:', err.message); });
}

function formatThreadText(text) {
    return escapeHtml(text).replace(/@(\S+)/g, '<span class="mention">@$1</span>');
}

function heartThreadPost(docId, btn) {
    if (!db || !currentUser) return;

    var likesEl = btn.nextElementSibling;
    var liked = btn.classList.contains('liked');
    var postRef = db.collection('community_thread').doc(docId);

    if (liked) {
        btn.classList.remove('liked');
        btn.textContent = '♡';
        postRef.update({
            likes: firebase.firestore.FieldValue.increment(-1),
            likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        if (isOwner) postRef.update({ likedByOwner: false });
    } else {
        btn.classList.add('liked');
        btn.textContent = '♥';
        postRef.update({
            likes: firebase.firestore.FieldValue.increment(1),
            likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        if (isOwner) postRef.update({ likedByOwner: true });
        trackPrestige('like');

        // Notify the post author
        postRef.get().then(function(doc) {
            if (doc.exists) {
                var d = doc.data();
                if (d.userId !== currentUser.uid) {
                    createNotification('heart', d.userId, currentUser.displayName, '', d.contentTitle);
                }
            }
        });
    }
}

// ── Notifications ──
function createNotification(type, targetUserId, fromName, text, contentTitle) {
    if (!db) return;
    db.collection('notifications').add({
        type: type,
        targetUserId: targetUserId,
        fromName: fromName,
        fromIsOwner: isOwner,
        text: text || '',
        contentTitle: contentTitle || '',
        read: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function() {});
}

function loadNotifications() {
    if (!db || !currentUser || currentUser.uid === 'demo') return;

    db.collection('notifications')
        .where('targetUserId', '==', currentUser.uid)
        .where('read', '==', false)
        .orderBy('timestamp', 'desc').limit(10)
        .onSnapshot(function(snapshot) {
            snapshot.docChanges().forEach(function(change) {
                if (change.type === 'added') {
                    var d = change.doc.data();
                    var prefix = d.fromIsOwner ? '👑 ' : '';
                    if (d.type === 'heart') {
                        showActivityToast(prefix + d.fromName + ' liked your post on ' + d.contentTitle);
                    } else if (d.type === 'mention') {
                        showActivityToast(prefix + d.fromName + ' mentioned you: "' + d.text.substring(0, 50) + '"');
                    } else if (d.type === 'reply') {
                        showActivityToast(prefix + d.fromName + ' replied on ' + d.contentTitle);
                    }
                    db.collection('notifications').doc(change.doc.id).update({ read: true });
                }
            });
        }, function() {});
}

// ── Video Player ──
function playVideo(card, videoId) {
    var thumbEl = card.querySelector('.video-thumb');
    if (!thumbEl) return;
    var embed = document.createElement('div');
    embed.className = 'video-embed';
    embed.innerHTML = '<iframe src="https://www.youtube.com/embed/' + videoId + '?autoplay=1" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    thumbEl.replaceWith(embed);
    card.onclick = null;
    trackPrestige('watch_video');
}

// ── Helpers ──
function buildAvatar(photoURL, name) {
    if (photoURL) return '<img class="thread-avatar" src="' + photoURL + '" alt="' + escapeHtml(name || '') + '" referrerpolicy="no-referrer">';
    var initial = (name || '?').charAt(0).toUpperCase();
    return '<div class="thread-avatar thread-avatar-fallback">' + initial + '</div>';
}

function getContentIcon(title) {
    var t = (title || '').toLowerCase();
    if (t.includes('video') || t.includes('chips') || t.includes('talk') || t.includes('outside') || t.includes('stain') || t.includes('sos')) return '🎬';
    if (t.includes('member') || t.includes('jefe') || t.includes('deluxe') || t.includes('donation')) return '💿';
    if (t.includes('hoodie') || t.includes('tee') || t.includes('merch') || t.includes('snapback') || t.includes('bag') || t.includes('glove') || t.includes('cd')) return '🛍️';
    return '💬';
}

// ── Activity Toasts ──
function showActivityToast(message) {
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:60px;right:12px;z-index:900;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:300px;';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.style.cssText = 'background:rgba(17,17,17,0.95);border:1px solid rgba(0,243,255,0.3);border-radius:10px;padding:10px 14px;font-size:0.75rem;color:#fff;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:toastIn 0.3s ease,toastOut 0.3s ease 3.7s forwards;pointer-events:auto;';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 4000);
}

// Inject dynamic CSS
(function() {
    var style = document.createElement('style');
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}@keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}' +
        '.thread-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;margin-bottom:4px;}' +
        '.thread-avatar-fallback{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--neon-cyan),var(--neon-magenta));font-size:0.7rem;font-weight:800;color:#fff;}' +
        '.owner-badge{font-size:0.55rem;font-weight:800;letter-spacing:1px;color:#FFD700;background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.4);padding:2px 8px;border-radius:4px;margin-left:4px;}' +
        '.owner-badge-inline{font-size:0.6rem;color:#FFD700;margin-left:4px;}' +
        '.owner-name{color:#FFD700 !important;}' +
        '.owner-post{border-color:rgba(255,215,0,0.3) !important;background:linear-gradient(135deg,rgba(255,215,0,0.04),var(--bg-card)) !important;}' +
        '.owner-liked{font-size:0.65rem;color:#FFD700;margin:4px 0;font-weight:600;}' +
        '.mention{color:var(--neon-cyan);font-weight:600;}';
    document.head.appendChild(style);
})();

// ── PWA Install ──
var deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); deferredInstallPrompt = e; showInstallBanner(); });

function showInstallBanner() {
    if (localStorage.getItem('jc_install_dismissed')) return;
    var banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'block';
}

function installApp() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function() { deferredInstallPrompt = null; dismissInstall(); });
    } else {
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            alert('To install:\n1. Tap the Share button\n2. Tap "Add to Home Screen"\n3. Tap "Add"');
        } else {
            alert('To install:\n1. Tap the browser menu (⋮)\n2. Tap "Install App"\n3. Confirm');
        }
    }
}

function dismissInstall() {
    var banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('jc_install_dismissed', '1');
}

function checkIOSInstall() {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone && !localStorage.getItem('jc_install_dismissed')) {
        var banner = document.getElementById('install-banner');
        if (banner) { banner.style.display = 'block'; var btn = document.getElementById('install-btn'); if (btn) btn.textContent = 'How to Install'; }
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
}

document.addEventListener('DOMContentLoaded', function() {
    updatePrestigeDisplay();
    checkIOSInstall();
    var textarea = document.getElementById('qc-text');
    if (textarea) { textarea.addEventListener('input', function() { document.getElementById('qc-chars').textContent = this.value.length; }); }
});
