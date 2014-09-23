var 
substitute = function(str, data){
	return str.replace(/\{(\w+)\}/g, function(r, m){
		return data[m] !== undefined ? data[m] : '{' + m + '}';
	});
},
template = 		'<!DOCTYPE html>'+
						'<html>'+
						'<head>'+
							'<meta charset="utf-8"/>'+
							'<title>{title}</title>'+
							'<style>a:link,a:hover,a:visited{color:#00E;}</style>'+
						'</head>'+
						'<body>'+
							'<h2>{pathname}</h2>'+
							'{body}'+
						'</body>'+
					'</html>';
					

//返回文件列表html
exports.list = function(obj,files){
	var
	html,
	path = obj.pathname+'/',
	arr = [];
	
	path = path.replace('//','/');
	for(var i =0;i<files.length;i++){
		arr.push('<li><a href="'+path+files[i]+'">'+files[i]+'</a></li>');
	}
	
	html = substitute(template,{title:'List',pathname:path,body:'<ul>'+arr.join('')+'</ul>'})
	return html;
};