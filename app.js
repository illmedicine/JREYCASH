const firebaseConfig = {
    apiKey: "AIzaSyDs9vWS1Z2L0w3VEyHCr7vhOveTF_6hcAw",
    authDomain: "jreycash-32ac9.firebaseapp.com",
    projectId: "jreycash-32ac9",
    storageBucket: "jreycash-32ac9.firebasestorage.app",
    messagingSenderId: "100386315419",
    appId: "1:100386315419:web:99eb552259c31ef9bffa3e",
    measurementId: "G-NSMBRBYVTH"
};

let auth, provider, db;
let currentUser = null;

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
    if (auth && provider) {
        auth.signInWithPopup(provider).then(result => {
            handleSignIn(result.user);
        }).catch(err => {
            console.warn('Google sign-in failed, using demo mode:', err.message);
            handleSignIn({ displayName: "Demo User", email: "demo@gmail.com", photoURL: "", uid: "demo" });
        });
    } else {
        handleSignIn({ displayName: "Demo User", email: "demo@gmail.com", photoURL: "", uid: "demo" });
    }
}

function handleSignIn(user) {
    currentUser = {
        uid: user.uid || 'demo',
        displayName: user.displayName || 'Fan',
        email: user.email || '',
        photoURL: user.photoURL || ''
    };

    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    document.getElementById('user-display-name').textContent = currentUser.displayName;
    document.getElementById('user-email-display').textContent = currentUser.email;

    const photoEl = document.getElementById('user-photo');
    if (currentUser.photoURL) {
        photoEl.src = currentUser.photoURL;
        photoEl.alt = currentUser.displayName;
    } else {
        photoEl.parentElement.style.background = 'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta))';
        photoEl.style.display = 'none';
    }

    initUserProfile();
    trackPrestige('login');
    loadLeaderboard();
}

function signOut() {
    if (auth) auth.signOut().catch(() => {});
    currentUser = null;
    document.getElementById('auth-gate').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('user-menu').style.display = 'none';
}

function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('user-menu');
    const avatar = document.getElementById('user-avatar');
    if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !avatar.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ── User Profile (Firestore) ──
function initUserProfile() {
    if (!db || !currentUser || currentUser.uid === 'demo') return;

    const userRef = db.collection('users').doc(currentUser.uid);
    userRef.get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            prestigePoints = data.prestigePoints || 0;
            updatePrestigeDisplay();
        } else {
            userRef.set({
                displayName: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
                prestigePoints: 0,
                joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        userRef.update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
    }).catch(err => console.warn('Profile load failed:', err.message));
}

// ── Navigation ──
function scrollToSection(e, sectionId) {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Portal Access ──
function accessPortal(e) {
    e.preventDefault();
    const pin = prompt("Enter 4-digit Owner PIN:");
    if (pin === "1234") {
        window.location.href = "portal.html";
    } else if (pin !== null) {
        alert("Access Denied: Incorrect PIN.");
    }
}

// ── Likes (Firestore-backed) ──
function toggleLike(btn, contentId) {
    btn.classList.toggle('liked');
    const icon = btn.querySelector('.like-icon');
    const count = btn.querySelector('.like-count');
    const current = parseInt(count.textContent);
    const isLiked = btn.classList.contains('liked');

    if (isLiked) {
        icon.textContent = '♥';
        count.textContent = current + 1;
        trackPrestige('like');
    } else {
        icon.textContent = '♡';
        count.textContent = Math.max(0, current - 1);
    }

    if (db && currentUser && contentId) {
        const likeRef = db.collection('likes').doc(contentId + '_' + currentUser.uid);
        const contentRef = db.collection('content_stats').doc(contentId);

        if (isLiked) {
            likeRef.set({
                userId: currentUser.uid,
                contentId: contentId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            contentRef.set({
                likeCount: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });
        } else {
            likeRef.delete().catch(() => {});
            contentRef.set({
                likeCount: firebase.firestore.FieldValue.increment(-1)
            }, { merge: true });
        }
    }
}

// ── Comments (Firestore-backed with real-time listener) ──
let activeCommentContentId = null;
let commentUnsubscribe = null;

function openComments(contentId) {
    activeCommentContentId = contentId;
    document.getElementById('comments-modal').style.display = 'flex';
    trackPrestige('view_comments');

    const list = document.getElementById('comments-list');
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Loading comments...</p>';

    if (commentUnsubscribe) commentUnsubscribe();

    if (db) {
        commentUnsubscribe = db.collection('comments')
            .where('contentId', '==', contentId)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                list.innerHTML = '';
                if (snapshot.empty) {
                    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No comments yet. Be the first!</p>';
                    return;
                }
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const comment = document.createElement('div');
                    comment.className = 'comment';
                    const timeStr = data.timestamp ? timeAgo(data.timestamp.toDate()) : 'Just now';
                    comment.innerHTML = `
                        <strong>${escapeHtml(data.displayName || 'Fan')}</strong>
                        <p>${escapeHtml(data.text)}</p>
                        <span class="comment-time">${timeStr}</span>
                    `;
                    list.appendChild(comment);
                });
            }, err => {
                console.warn('Comments listener error:', err.message);
                showFallbackComments(list);
            });
    } else {
        showFallbackComments(list);
    }
}

function showFallbackComments(list) {
    list.innerHTML = `
        <div class="comment">
            <strong>JefeGang_Nate</strong>
            <p>This is heat 🔥🔥🔥</p>
            <span class="comment-time">2h ago</span>
        </div>
        <div class="comment">
            <strong>UpstateQueen</strong>
            <p>Buffalo stand up!! Jrey never misses</p>
            <span class="comment-time">5h ago</span>
        </div>
        <div class="comment">
            <strong>BuffaloFan716</strong>
            <p>Been waiting for this drop 💎</p>
            <span class="comment-time">1d ago</span>
        </div>
    `;
}

function closeComments() {
    document.getElementById('comments-modal').style.display = 'none';
    if (commentUnsubscribe) {
        commentUnsubscribe();
        commentUnsubscribe = null;
    }
    activeCommentContentId = null;
}

function postComment() {
    const input = document.getElementById('comment-text');
    const text = input.value.trim();
    if (!text) return;

    const displayName = currentUser ? currentUser.displayName : 'Fan';

    if (db && activeCommentContentId && currentUser) {
        db.collection('comments').add({
            contentId: activeCommentContentId,
            userId: currentUser.uid,
            displayName: displayName,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn('Comment post failed:', err.message));
    } else {
        const list = document.getElementById('comments-list');
        const noComments = list.querySelector('p[style]');
        if (noComments) list.innerHTML = '';
        const comment = document.createElement('div');
        comment.className = 'comment';
        comment.innerHTML = `
            <strong>${escapeHtml(displayName)}</strong>
            <p>${escapeHtml(text)}</p>
            <span class="comment-time">Just now</span>
        `;
        list.insertBefore(comment, list.firstChild);
    }

    input.value = '';
    trackPrestige('comment');
}

// ── Prestige System (Firestore-backed) ──
let prestigePoints = parseInt(localStorage.getItem('jc_prestige') || '0');

const PRESTIGE_ACTIONS = {
    login: 10,
    like: 2,
    comment: 5,
    view_comments: 1,
    purchase: 50,
    watch_video: 3,
    store_visit: 2
};

function trackPrestige(action) {
    const points = PRESTIGE_ACTIONS[action] || 0;
    prestigePoints += points;
    localStorage.setItem('jc_prestige', prestigePoints.toString());
    updatePrestigeDisplay();

    if (db && currentUser && currentUser.uid !== 'demo') {
        db.collection('users').doc(currentUser.uid).update({
            prestigePoints: prestigePoints
        }).catch(() => {});
    }
}

function getPrestigeLevel() {
    if (prestigePoints >= 14000) return { level: 12, tier: 'Diamond', icon: '👑' };
    if (prestigePoints >= 10000) return { level: 10, tier: 'Platinum', icon: '💎' };
    if (prestigePoints >= 6000) return { level: 7, tier: 'Gold', icon: '🥇' };
    if (prestigePoints >= 3000) return { level: 4, tier: 'Silver', icon: '🥈' };
    if (prestigePoints >= 500) return { level: 2, tier: 'Bronze', icon: '🥉' };
    return { level: 1, tier: 'Newcomer', icon: '🔥' };
}

function updatePrestigeDisplay() {
    const p = getPrestigeLevel();
    const badgeEl = document.getElementById('user-prestige');
    if (badgeEl) {
        badgeEl.querySelector('.badge-icon').textContent = p.icon;
        badgeEl.querySelector('.badge-level').textContent = 'LVL ' + p.level;
    }
    const menuLevel = document.getElementById('menu-prestige-level');
    if (menuLevel) menuLevel.textContent = p.level + ' (' + p.tier + ')';
}

// ── Leaderboard (Firestore-backed, real-time) ──
function loadLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container || !db) return;

    db.collection('users')
        .orderBy('prestigePoints', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            if (snapshot.empty) return;

            container.innerHTML = '';
            let rank = 0;
            snapshot.forEach(doc => {
                rank++;
                const data = doc.data();
                const p = getPrestigeLevelFor(data.prestigePoints || 0);
                const item = document.createElement('div');
                item.className = 'leaderboard-item' + (rank <= 3 ? ' rank-' + rank : '');

                const rankDisplay = rank === 1 ? '👑' : rank.toString();
                const isCurrentUser = currentUser && doc.id === currentUser.uid;

                item.innerHTML = `
                    <span class="lb-rank">${rankDisplay}</span>
                    <div class="lb-info">
                        <h4 style="font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:700;">
                            ${escapeHtml(data.displayName || 'Fan')}${isCurrentUser ? ' (You)' : ''}
                        </h4>
                        <p style="font-size:0.7rem;color:var(--text-muted);">Level ${p.level} • ${p.tier} Prestige</p>
                    </div>
                    <span class="lb-points">${(data.prestigePoints || 0).toLocaleString()} pts</span>
                `;
                container.appendChild(item);
            });
        }, () => {});
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
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString();
}

// ── Video Player (lazy iframe load on tap) ──
function playVideo(card, videoId) {
    const thumbEl = card.querySelector('.video-thumb');
    if (!thumbEl) return;

    const embed = document.createElement('div');
    embed.className = 'video-embed';
    embed.innerHTML = '<iframe src="https://www.youtube.com/embed/' + videoId + '?autoplay=1" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    thumbEl.replaceWith(embed);
    card.onclick = null;
    trackPrestige('watch_video');
}

document.addEventListener('DOMContentLoaded', updatePrestigeDisplay);
