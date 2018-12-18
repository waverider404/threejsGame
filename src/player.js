function Player(scene, camera, stage) {
	var material = new THREE.MeshLambertMaterial({color: "green", skinning: true});
	var loader = new THREE.FBXLoader();
	var meshGroup;
	var mixer;
	var actionFadeFactor = 0.3;
	var idleAction;
	var crossFadingToIdle = false;
	var walkAction;
	var crossFadingToWalk = false;
	var torsoControlBone;
	var torsoRotationFrameCount = 3;
	var pelvisBone;
	var pelvisRotationCurr = 0;
	var pelvisRotationStart;
	var pelvisRotationEnd;
	var pelvisRotationTime;
	var pelvisRotationTimeFactor = 4;
	var shouldResetLerp = false;
	var sphericalPos = new THREE.Spherical(5, Math.PI / 2, Math.PI);
	var rotationFactor = 0.001;
	var zoomFactor = 0.005;
	var cameraOffset = new THREE.Vector3(-0.8, 2, 1);
	var position = new THREE.Vector3();
	var velocity = new THREE.Vector3();
	var gravityVelocity = 0;
	var maxSpeed = 500;
	var acceleration = 0.6;
	var deceleration = 0.9;
	var jumpVelociy = 17;
	var gravity = 0.5;
	var update = true;
	var collisionMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), new THREE.MeshBasicMaterial({color: "yellow", wireframe: true, visible: true}));
	var surfaceNormal = new THREE.Vector3(0, 1, 0);
	var walkableAngle = 0.7;

	this.enterFreeCam = function() {
		update = false;
		var pos = camera.getWorldPosition(new THREE.Vector3());
		var quat = camera.getWorldQuaternion(new THREE.Quaternion());
		torsoControlBone.remove(camera);
		camera.position.copy(pos);
		camera.quaternion.copy(quat);
	}

	this.exitFreeCam = function() {
		update = true;
		torsoControlBone.add(camera);
		updateCamera();
	}

	loader.load("res/player/player3.fbx", function(object) {
		meshGroup = object;
		Utilities.removeStaticKeyframeData(meshGroup.animations);
		var skinnedMesh = meshGroup.getObjectByName("playerMesh");
		skinnedMesh.material = material;
		torsoControlBone = skinnedMesh.skeleton.getBoneByName("torsoControlBone");
		pelvisBone = skinnedMesh.skeleton.getBoneByName("pelvis");
		mixer = new THREE.AnimationMixer(meshGroup);
		
		idleAction = mixer.clipAction(THREE.AnimationClip.findByName(meshGroup.animations, "armatureMesh|idle"));
		idleAction.setDuration(7);
		idleAction.enabled = true;
		idleAction.play();

		walkAction = mixer.clipAction(THREE.AnimationClip.findByName(meshGroup.animations, "armatureMesh|walk"));
		walkAction.setDuration(1.5);
		walkAction.enabled = false;
		walkAction.play();

		torsoControlBone.add(camera);
		updateCamera();

		meshGroup.add(collisionMesh);
		collisionMesh.translateY(1.15);

		scene.add(meshGroup);
	});

	this.update = function(timeStep) {
		if(!update)
			return;

		//mouse move
		var mouseMovement = Input.getInstance().getMouseMovement();
		if(mouseMovement.x != 0 || mouseMovement.y != 0) {
			var rotationX = -mouseMovement.x * rotationFactor;
			var rotationY = -mouseMovement.y * rotationFactor;

			torsoControlBone.rotateY(rotationX);

			if(Math.abs(torsoControlBone.rotation.y) > Math.PI / 3) {
				torsoControlBone.rotation.y = Math.sign(torsoControlBone.rotation.y) * Math.PI / 3;
				meshGroup.rotateY(rotationX);
				torsoRotationFrameCount = 0;
			}
			
			sphericalPos.phi += rotationY;

			if(sphericalPos.phi < 0.01)
				sphericalPos.phi = 0.01;

			if(sphericalPos.phi > Math.PI)
				sphericalPos.phi = Math.PI;

			updateCamera();
		}

		//mouse scroll
		var mouseScrollAmount = Input.getInstance().getMouseScroll();
		if(mouseScrollAmount != 0) {
			sphericalPos.radius -= mouseScrollAmount * zoomFactor;

			if(sphericalPos.radius < 0.1)
				sphericalPos.radius = 0.1;

			updateCamera();
		}

		var direction = new THREE.Vector3();

		if(Input.getInstance().isKeyHeld(87)) //W
			direction.z += 1;

		if(Input.getInstance().isKeyHeld(83)) //S
			direction.z += -1;

		if(Input.getInstance().isKeyHeld(65)) //A
			direction.x += 1;

		if(Input.getInstance().isKeyHeld(68)) //D
			direction.x += -1;

		if(Input.getInstance().isKeyPressed(32)) { //space
			gravityVelocity = jumpVelociy;
		}

		if(direction.length() != 0) {
			direction.normalize();
			var torsoPelvisRotDiff = torsoControlBone.rotation.y + pelvisBone.rotation.y;
			var pRot = pelvisBone.rotation.y;
			meshGroup.rotateY(-torsoControlBone.rotation.y);
			torsoControlBone.rotation.y = 0;

			if(shouldResetLerp) {
				shouldResetLerp = false;
				pelvisBone.rotation.y = torsoPelvisRotDiff;
				pelvisRotationCurr = pelvisBone.rotation.y;
				pelvisRotationStart = pelvisRotationCurr;
				pelvisRotationTime = 0;
			}

			if(direction.z >= 0) {
				pelvisRotationLerpTo(Math.atan2(direction.z, -direction.x) - Math.PI / 2);
				walkAction.setEffectiveTimeScale(1);
			}
			else {
				pelvisRotationLerpTo(Math.atan2(-direction.z, direction.x) - Math.PI / 2);
				walkAction.setEffectiveTimeScale(-1);
			}

			crossFadeToWalk();
		}
		else {
			shouldResetLerp = true;
			pelvisRotationLerpTo(0);

			if(torsoRotationFrameCount <= 2)
				crossFadeToWalk();
			else
				crossFadeToIdle();
		}

		pelvisRotationCurr = Utilities.lerp(pelvisRotationStart, pelvisRotationEnd, pelvisRotationTime);
		pelvisRotationTime += timeStep * pelvisRotationTimeFactor * (Math.PI / Math.abs(pelvisRotationEnd - pelvisRotationStart));
		pelvisBone.rotation.y = pelvisRotationCurr;

		if(torsoRotationFrameCount <= 2)
			torsoRotationFrameCount++;
		
		var length = velocity.length();
		velocity.projectOnPlane(surfaceNormal).setLength(length);

		direction.projectOnPlane(surfaceNormal).normalize();
		velocity.add(direction.multiplyScalar(acceleration)).multiplyScalar(deceleration);
		gravityVelocity -= gravity;

		//isn't even necessary?
		//velocity.x = Utilities.clamp(velocity.x, -1, 1);
		//velocity.z = Utilities.clamp(velocity.z, -1, 1);

		//if(Math.abs(velocity.x) < 0.0001)
		//	velocity.x = 0;
		//if(Math.abs(velocity.z) < 0.0001)
		//	velocity.z = 0;

		meshGroup.translateX(velocity.x * timeStep);
		meshGroup.translateY((velocity.y + gravityVelocity) * timeStep);
		meshGroup.translateZ(velocity.z * timeStep);

		mixer.update(timeStep);

		meshGroup.updateMatrixWorld();
		detectCollisions();
	}

	function detectCollisions() {
		surfaceNormal = new THREE.Vector3(0, 1, 0);
		var colliding = false;

		var collisionMeshBounds = new THREE.Box3().setFromObject(collisionMesh);
		var gameObjects = stage.octree.retrieve(meshGroup);
		collisionMesh.material.color.set("yellow");

		for(var i = 0; i < gameObjects.length; i++) {
			var gameObjectBounds = new THREE.Box3().setFromObject(gameObjects[i]);
			if(collisionMeshBounds.intersectsBox(gameObjectBounds)) {
				var res = Utilities.GJK(collisionMesh, gameObjects[i], scene);
				
				if(res != null) {
					collisionMesh.material.color.set("red");
					colliding = true;
					var up = new THREE.Vector3(0, 1, 0);
					if(res.dir.clone().dot(up) >= walkableAngle) { //walkable
						var resUp = up.clone().setLength(res.dist / Math.cos(up.clone().dot(res.dir)));
						resolveCollisionUp(res.dir, resUp);
					}
					else {
						resolveCollision(res);
					}
				}
			}
		}

		var terrainSurf = stage.getTerrainSurface(meshGroup.position);
		if(meshGroup.position.y < terrainSurf.height) {
			var up = new THREE.Vector3(0, 1, 0);
			if(terrainSurf.normal.clone().dot(up) >= walkableAngle) { //walkable
				var resUp = up.clone().setLength(terrainSurf.height - meshGroup.position.y);
				resolveCollisionUp(terrainSurf.normal, resUp);
			}
			else {
				var dist = Math.cos(up.clone().dot(terrainSurf.normal)) * (terrainSurf.height - meshGroup.position.y);
				var res = { dist: dist , dir: terrainSurf.normal };
				resolveCollision(res);
			}
		}
	}

	function resolveCollisionUp(surfNorm, resUp) {
		meshGroup.position.add(resUp);
		meshGroup.updateMatrixWorld();

		surfaceNormal = surfNorm;//res.dir.clone().negate();
		var quat = new THREE.Quaternion();
		meshGroup.getWorldQuaternion(quat);
		surfaceNormal.applyQuaternion(quat.inverse());

		gravityVelocity = -gravity;
	}

	function resolveCollision(resObj) {
		meshGroup.position.add(resObj.dir.clone().multiplyScalar(resObj.dist));
		meshGroup.updateMatrixWorld();

		var quat = new THREE.Quaternion();
		meshGroup.getWorldQuaternion(quat);
		resObj.dir.applyQuaternion(quat.inverse());
		velocity.projectOnPlane(resObj.dir);
	}

	var pelvisRotationLerpTo = function(pelvisRotationEndNew) {
		if(pelvisRotationEndNew == pelvisRotationEnd)
			return;

		pelvisRotationEnd = pelvisRotationEndNew;
		pelvisRotationStart = pelvisRotationCurr;
		pelvisRotationTime = 0;
	}

	function updateCamera() {
		camera.position.setFromSpherical(sphericalPos);
		var pos = new THREE.Vector3();
		meshGroup.getWorldPosition(pos);
		camera.lookAt(pos);
		camera.position.add(cameraOffset);
	}

	function crossFadeToWalk() {
		crossFadingToIdle = false;
		if(crossFadingToWalk)
			return;

		crossFadingToWalk = true;

		idleAction.stopFading();
		walkAction.stopFading();

		walkAction.enabled = true;

		var idleActionWeight = idleAction.getEffectiveWeight();
		idleAction._scheduleFading(actionFadeFactor * idleActionWeight, idleActionWeight, 0);

		var walkActionWeight =  walkAction.getEffectiveWeight();
		walkAction._scheduleFading(actionFadeFactor * (1 - walkActionWeight), walkActionWeight, 1);
	}

	function crossFadeToIdle() {
		crossFadingToWalk = false;
		if(crossFadingToIdle)
			return;
		
		crossFadingToIdle = true;

		idleAction.stopFading();
		walkAction.stopFading();

		idleAction.enabled = true;

		var idleActionWeight = idleAction.getEffectiveWeight();
		idleAction._scheduleFading(actionFadeFactor * (1 - idleActionWeight), idleActionWeight, 1);

		var walkActionWeight =  walkAction.getEffectiveWeight();
		walkAction._scheduleFading(actionFadeFactor * walkActionWeight, walkActionWeight, 0);
	}
}